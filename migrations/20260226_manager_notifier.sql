-- ═══════════════════════════════════════════════════════════════════════
-- MIGRATION: manager_notifier — alerts + settings + triggers
-- Date: 2026-02-26
-- Idempotent: uses IF NOT EXISTS, DROP … IF EXISTS, ADD COLUMN IF NOT EXISTS
--
-- Parts:
--   1. manager_settings  (singleton: tg_chat_id du gérant)
--   2. manager_alerts    (queue pour le worker Railway)
--   3. ledger_entries    (ensure payment_event_id column)
--   4. fn_payment_event_paid (remplace la v1 — ajoute manager_alerts row)
--   5. fn_tx_validated   (transactions status pending→valid)
--   6. fn_spender_vip    (spenders.classification→'vip')
--   7. fn_spender_hot    (spenders.classification→'hot' = relation hot)
--   8. fn_budget_high    (TX > 500 CHF)
--   9. fn_tx_burst       (3 TX en 24h pour un même spender)
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════
-- PART 1 — MANAGER SETTINGS (singleton)
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.manager_settings (
  id         bool PRIMARY KEY DEFAULT true,
  CONSTRAINT manager_settings_singleton CHECK (id = true),
  tg_chat_id text,                        -- Telegram chat_id du gérant
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS: service role only (the worker uses service_role_key)
ALTER TABLE public.manager_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ms_gerant_all ON public.manager_settings;
CREATE POLICY ms_gerant_all ON public.manager_settings FOR ALL USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'gerant'
);

-- ═══════════════════════════════════════════════════
-- PART 2 — MANAGER ALERTS (worker queue)
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.manager_alerts (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  timestamptz DEFAULT now(),
  type        text NOT NULL,  -- payment_paid | tx_validated | spender_vip | budget_high | tx_burst | relation_hot
  message     text NOT NULL,  -- HTML text ready for Telegram sendMessage
  payload     jsonb,          -- raw event data for debugging
  status      text NOT NULL DEFAULT 'pending',  -- pending | sent | error
  sent_at     timestamptz,
  last_error  text,
  retry_count int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_manager_alerts_status_created
  ON public.manager_alerts (status, created_at ASC)
  WHERE status = 'pending';

ALTER TABLE public.manager_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ma_gerant_all ON public.manager_alerts;
CREATE POLICY ma_gerant_all ON public.manager_alerts FOR ALL USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'gerant'
);

-- ═══════════════════════════════════════════════════
-- PART 3 — ENSURE ledger_entries.payment_event_id
-- ═══════════════════════════════════════════════════

ALTER TABLE public.ledger_entries
  ADD COLUMN IF NOT EXISTS payment_event_id uuid REFERENCES public.payment_events(id);

-- ═══════════════════════════════════════════════════
-- PART 4 — TRIGGER: payment_events → paid
--   • ledger_entries (débit payer + crédit receiver)
--   • notifications (receiver)
--   • manager_alerts (type=payment_paid)
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_payment_event_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_title         text;
  v_from_name     text;
  v_to_name       text;
  v_alert_msg     text;
BEGIN
  -- Only fire when status transitions TO 'paid'
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status <> 'paid') THEN

    v_title := COALESCE(NEW.title, NEW.kind, 'Paiement interne');

    -- Resolve display names
    SELECT COALESCE(full_name, username, display_name, 'Inconnu')
      INTO v_from_name
      FROM public.profiles WHERE id = NEW.from_user_id;

    SELECT COALESCE(full_name, username, display_name, 'Inconnu')
      INTO v_to_name
      FROM public.profiles WHERE id = NEW.to_user_id;

    -- 1) Ledger: payer debit (negative)
    INSERT INTO public.ledger_entries (
      created_by, owner_user_id, counterparty_user_id,
      entry_type, amount, currency, title, note, payment_event_id
    ) VALUES (
      NEW.created_by, NEW.from_user_id, NEW.to_user_id,
      'payer_debit', -NEW.amount, NEW.currency,
      v_title, NEW.note, NEW.id
    );

    -- 2) Ledger: receiver credit (positive)
    INSERT INTO public.ledger_entries (
      created_by, owner_user_id, counterparty_user_id,
      entry_type, amount, currency, title, note, payment_event_id
    ) VALUES (
      NEW.created_by, NEW.to_user_id, NEW.from_user_id,
      COALESCE(NEW.kind, 'receiver_credit'), NEW.amount, NEW.currency,
      v_title, NEW.note, NEW.id
    );

    -- 3) Notification for receiver
    INSERT INTO public.notifications (user_id, type, title, message, read)
    VALUES (
      NEW.to_user_id,
      COALESCE(NEW.kind, 'payment'),
      v_title || ' 💸',
      'Paiement reçu de ' || COALESCE(v_from_name, '?') || ' : ' ||
        NEW.amount::text || ' ' || NEW.currency,
      false
    );

    -- 4) Manager alert
    v_alert_msg :=
      '💸 <b>Paiement effectué</b>' || E'\n' ||
      'De : ' || COALESCE(v_from_name, '?') || ' → ' || COALESCE(v_to_name, '?') || E'\n' ||
      'Montant : <b>' || NEW.amount::text || ' ' || NEW.currency || '</b>' || E'\n' ||
      'Type : ' || COALESCE(NEW.kind, '-') ||
      CASE WHEN NEW.note IS NOT NULL THEN E'\n' || 'Note : ' || NEW.note ELSE '' END;

    INSERT INTO public.manager_alerts (type, message, payload)
    VALUES (
      'payment_paid',
      v_alert_msg,
      jsonb_build_object(
        'payment_event_id', NEW.id,
        'from_user_id', NEW.from_user_id,
        'to_user_id', NEW.to_user_id,
        'amount', NEW.amount,
        'currency', NEW.currency,
        'kind', NEW.kind
      )
    );

  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_event_paid        ON public.payment_events;
DROP TRIGGER IF EXISTS trg_payment_event_paid_insert ON public.payment_events;

CREATE TRIGGER trg_payment_event_paid
  AFTER UPDATE ON public.payment_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_payment_event_paid();

-- Also handle INSERT when already paid (edge case: bulk import)
CREATE TRIGGER trg_payment_event_paid_insert
  AFTER INSERT ON public.payment_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_payment_event_paid();

-- ═══════════════════════════════════════════════════
-- PART 5 — TRIGGER: transactions status pending → valid
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_tx_validated()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_spender_name text;
  v_alert_msg    text;
BEGIN
  IF NEW.status = 'valid' AND OLD.status = 'pending' THEN

    SELECT COALESCE(name, username, tg_user_id::text, 'Inconnu')
      INTO v_spender_name
      FROM public.spenders
      WHERE id = NEW.spender_id;

    v_alert_msg :=
      '✅ <b>TX validée</b>' || E'\n' ||
      'Spender : ' || COALESCE(v_spender_name, '?') || E'\n' ||
      'Montant : <b>' || NEW.amount::text || ' ' || COALESCE(NEW.currency, 'EUR') || '</b>';

    INSERT INTO public.manager_alerts (type, message, payload)
    VALUES (
      'tx_validated',
      v_alert_msg,
      jsonb_build_object(
        'tx_id', NEW.id,
        'spender_id', NEW.spender_id,
        'amount', NEW.amount,
        'currency', NEW.currency
      )
    );

  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tx_validated ON public.transactions;
CREATE TRIGGER trg_tx_validated
  AFTER UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_tx_validated();

-- ═══════════════════════════════════════════════════
-- PART 6 — TRIGGER: spender classification → 'vip'
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_spender_vip()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_name      text;
  v_alert_msg text;
BEGIN
  IF NEW.classification = 'vip'
     AND (OLD.classification IS DISTINCT FROM 'vip') THEN

    v_name := COALESCE(NEW.name, NEW.username, NEW.tg_user_id::text, 'Inconnu');

    v_alert_msg :=
      '⭐ <b>Nouveau VIP</b>' || E'\n' ||
      COALESCE(v_name, '?') || ' vient de passer en classification <b>VIP</b>.';

    INSERT INTO public.manager_alerts (type, message, payload)
    VALUES (
      'spender_vip',
      v_alert_msg,
      jsonb_build_object('spender_id', NEW.id, 'name', v_name)
    );

  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_spender_vip ON public.spenders;
CREATE TRIGGER trg_spender_vip
  AFTER UPDATE ON public.spenders
  FOR EACH ROW EXECUTE FUNCTION public.fn_spender_vip();

-- ═══════════════════════════════════════════════════
-- PART 7 — TRIGGER: spender classification → 'hot' (relation hot)
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_spender_hot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_name      text;
  v_alert_msg text;
BEGIN
  IF NEW.classification = 'hot'
     AND (OLD.classification IS DISTINCT FROM 'hot') THEN

    v_name := COALESCE(NEW.name, NEW.username, NEW.tg_user_id::text, 'Inconnu');

    v_alert_msg :=
      '❤️ <b>Relation HOT</b>' || E'\n' ||
      COALESCE(v_name, '?') || ' est passé en statut <b>HOT</b>.';

    INSERT INTO public.manager_alerts (type, message, payload)
    VALUES (
      'relation_hot',
      v_alert_msg,
      jsonb_build_object('spender_id', NEW.id, 'name', v_name)
    );

  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_spender_hot ON public.spenders;
CREATE TRIGGER trg_spender_hot
  AFTER UPDATE ON public.spenders
  FOR EACH ROW EXECUTE FUNCTION public.fn_spender_hot();

-- ═══════════════════════════════════════════════════
-- PART 8 — TRIGGER: TX amount > 500 CHF (budget élevé)
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_budget_high()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_spender_name text;
  v_alert_msg    text;
BEGIN
  -- Fire on INSERT or when amount/currency changes
  IF NEW.amount > 500
     AND UPPER(COALESCE(NEW.currency, '')) IN ('CHF', 'EUR', 'USD')
     AND (TG_OP = 'INSERT' OR OLD.amount <= 500 OR OLD.currency IS DISTINCT FROM NEW.currency)
  THEN

    SELECT COALESCE(name, username, tg_user_id::text, 'Inconnu')
      INTO v_spender_name
      FROM public.spenders
      WHERE id = NEW.spender_id;

    v_alert_msg :=
      '🚨 <b>Budget élevé détecté</b>' || E'\n' ||
      'Spender : ' || COALESCE(v_spender_name, '?') || E'\n' ||
      'Montant : <b>' || NEW.amount::text || ' ' || COALESCE(NEW.currency, '?') || '</b>';

    INSERT INTO public.manager_alerts (type, message, payload)
    VALUES (
      'budget_high',
      v_alert_msg,
      jsonb_build_object(
        'tx_id', NEW.id,
        'spender_id', NEW.spender_id,
        'amount', NEW.amount,
        'currency', NEW.currency
      )
    );

  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_budget_high_insert ON public.transactions;
DROP TRIGGER IF EXISTS trg_budget_high_update ON public.transactions;

CREATE TRIGGER trg_budget_high_insert
  AFTER INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_budget_high();

CREATE TRIGGER trg_budget_high_update
  AFTER UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_budget_high();

-- ═══════════════════════════════════════════════════
-- PART 9 — TRIGGER: 3 TX par spender en 24h (tx_burst)
--   Fire exactly when count reaches 3 (not on 4th, 5th, …)
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_tx_burst()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count        int;
  v_spender_name text;
  v_alert_msg    text;
BEGIN
  IF NEW.spender_id IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*)
    INTO v_count
    FROM public.transactions
    WHERE spender_id = NEW.spender_id
      AND created_at > now() - interval '24 hours';

  -- Alert only when exactly hitting 3 (avoids repeated alerts on 4th, 5th…)
  IF v_count = 3 THEN

    SELECT COALESCE(name, username, tg_user_id::text, 'Inconnu')
      INTO v_spender_name
      FROM public.spenders
      WHERE id = NEW.spender_id;

    v_alert_msg :=
      '🔥 <b>3 TX en 24h</b>' || E'\n' ||
      COALESCE(v_spender_name, '?') || ' a effectué <b>3 transactions</b> ces dernières 24h.';

    INSERT INTO public.manager_alerts (type, message, payload)
    VALUES (
      'tx_burst',
      v_alert_msg,
      jsonb_build_object(
        'spender_id', NEW.spender_id,
        'tx_count_24h', v_count,
        'last_tx_id', NEW.id
      )
    );

  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tx_burst ON public.transactions;
CREATE TRIGGER trg_tx_burst
  AFTER INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_tx_burst();
