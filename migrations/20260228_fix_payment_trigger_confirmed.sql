-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: Fix trigger payment_events — déclencher ledger sur
-- status = 'confirmed' (Flow A chatter) ET 'validated' (Flow B provider)
-- en plus de 'paid' (existant)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_payment_event_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_title text;
  v_from_name text;
  v_to_name text;
  v_trigger_status text;
BEGIN
  -- Déclencher sur : paid | confirmed | validated
  v_trigger_status := NULL;
  IF NEW.status IN ('paid', 'confirmed', 'validated')
     AND (OLD.status IS NULL OR OLD.status NOT IN ('paid', 'confirmed', 'validated')) THEN
    v_trigger_status := NEW.status;
  END IF;

  IF v_trigger_status IS NULL THEN
    RETURN NEW;
  END IF;

  v_title := COALESCE(NEW.title, NEW.kind, 'Paiement interne');

  -- Récupérer les noms pour les notifications
  SELECT COALESCE(full_name, username, display_name, 'Inconnu')
    INTO v_from_name FROM public.profiles WHERE id = NEW.from_user_id;
  SELECT COALESCE(full_name, username, display_name, 'Inconnu')
    INTO v_to_name FROM public.profiles WHERE id = NEW.to_user_id;

  -- 1) Ledger entry pour le PAYEUR (débit)
  INSERT INTO public.ledger_entries (
    created_by, owner_user_id, counterparty_user_id,
    entry_type, amount, currency, title, note, payment_event_id
  ) VALUES (
    NEW.created_by, NEW.from_user_id, NEW.to_user_id,
    'payer_debit', -NEW.amount, NEW.currency,
    v_title, NEW.note, NEW.id
  )
  ON CONFLICT DO NOTHING;

  -- 2) Ledger entry pour le RECEVEUR (crédit)
  INSERT INTO public.ledger_entries (
    created_by, owner_user_id, counterparty_user_id,
    entry_type, amount, currency, title, note, payment_event_id
  ) VALUES (
    NEW.created_by, NEW.to_user_id, NEW.from_user_id,
    COALESCE(NEW.kind, 'receiver_credit'), NEW.amount, NEW.currency,
    v_title, NEW.note, NEW.id
  )
  ON CONFLICT DO NOTHING;

  -- 3) Notification pour le RECEVEUR (si pas déjà notifié)
  IF v_trigger_status = 'paid' THEN
    INSERT INTO public.notifications (user_id, type, title, message, tx_id, read)
    VALUES (
      NEW.to_user_id,
      COALESCE(NEW.kind, 'payment'),
      v_title || ' 💸',
      'Paiement reçu de ' || COALESCE(v_from_name, '?') || ' : ' || NEW.amount::text || ' ' || NEW.currency,
      NULL, false
    );
  END IF;

  -- 4) Notification pour le GÉRANT quand le receveur confirme (Flow A)
  IF v_trigger_status = 'confirmed' THEN
    -- Notifier le from_user (gérant) que la réception est confirmée
    INSERT INTO public.notifications (user_id, type, title, message, tx_id, read)
    VALUES (
      NEW.from_user_id,
      'payment_confirmed',
      '✅ Réception confirmée',
      COALESCE(v_to_name, '?') || ' a confirmé la réception de ' || NEW.amount::text || ' ' || NEW.currency,
      NULL, false
    );
  END IF;

  -- 5) Notification pour le PROVIDER quand le gérant valide (Flow B)
  IF v_trigger_status = 'validated' THEN
    INSERT INTO public.notifications (user_id, type, title, message, tx_id, read)
    VALUES (
      NEW.from_user_id,
      'payment_validated',
      '✅ Paiement validé',
      'Votre paiement de ' || NEW.amount::text || ' ' || NEW.currency || ' a été validé par ' || COALESCE(v_to_name, '?'),
      NULL, false
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Recréer les triggers
DROP TRIGGER IF EXISTS trg_payment_event_paid ON public.payment_events;
CREATE TRIGGER trg_payment_event_paid
  AFTER UPDATE ON public.payment_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_payment_event_paid();

DROP TRIGGER IF EXISTS trg_payment_event_paid_insert ON public.payment_events;
CREATE TRIGGER trg_payment_event_paid_insert
  AFTER INSERT ON public.payment_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_payment_event_paid();
