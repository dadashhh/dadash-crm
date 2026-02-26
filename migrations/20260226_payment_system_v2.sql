-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: Payment System V2 — Stabilisation définitive
-- Date: 2026-02-26
--
-- Bugs corrigés :
--   1. Trigger stockait amount négatif pour payer_debit → viole CHECK (amount>0)
--   2. entry_type incohérent (COALESCE(kind,'receiver_credit'))
--   3. RLS le_insert_gerant bloquait les inserts du trigger SECURITY DEFINER
--   4. note colonne nullable → NOT NULL DEFAULT ''
--   5. Pas de guard idempotence → risque de doublons ledger
--   6. Données existantes : montants négatifs migrés vers ABS, entry_type normalisé
--
-- Architecture cible :
--   • ledger_entries.amount  TOUJOURS > 0
--   • entry_type             'payer_debit' | 'receiver_credit' uniquement
--   • Sens comptable dans l'UI : payer_debit → soustrait, receiver_credit → ajoute
--   • Trigger SECURITY DEFINER, bypasse RLS, guard sur payment_event_id
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1 — FIX ledger_entries SCHEMA
-- ─────────────────────────────────────────────────────────────────────────────

-- 1a. Ensure payment_event_id column exists (idempotent)
ALTER TABLE public.ledger_entries
  ADD COLUMN IF NOT EXISTS payment_event_id uuid REFERENCES public.payment_events(id);

-- 1b. Migrate NULL notes → '' before adding NOT NULL constraint
UPDATE public.ledger_entries SET note = '' WHERE note IS NULL;

-- 1c. note NOT NULL DEFAULT ''
ALTER TABLE public.ledger_entries
  ALTER COLUMN note SET DEFAULT '',
  ALTER COLUMN note SET NOT NULL;

-- 1d. Migrate existing negative amounts → positive (payer_debit lines)
--     stored as negative in v1, now always positive (entry_type carries the sign)
UPDATE public.ledger_entries
  SET amount = ABS(amount)
  WHERE amount < 0;

-- 1e. Normalize entry_type: anything not in the two canonical values → 'receiver_credit'
UPDATE public.ledger_entries
  SET entry_type = 'receiver_credit'
  WHERE entry_type NOT IN ('payer_debit', 'receiver_credit');

-- 1f. Drop old CHECK constraint if any, add correct one (amount > 0)
ALTER TABLE public.ledger_entries
  DROP CONSTRAINT IF EXISTS ledger_entries_amount_check;
ALTER TABLE public.ledger_entries
  ADD CONSTRAINT ledger_entries_amount_check CHECK (amount > 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2 — FIX RLS ledger_entries
--   Le trigger SECURITY DEFINER n'a pas besoin de policy INSERT.
--   Supprimer la policy restrictive qui bloquait les inserts du trigger.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS le_insert_gerant ON public.ledger_entries;

-- Gérant: accès complet (lecture + écriture manuelle si besoin)
DROP POLICY IF EXISTS le_all_gerant ON public.ledger_entries;
CREATE POLICY le_all_gerant ON public.ledger_entries FOR ALL USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'gerant'
);

-- Autres rôles: lecture uniquement de ses propres entrées
DROP POLICY IF EXISTS le_select_own ON public.ledger_entries;
CREATE POLICY le_select_own ON public.ledger_entries FOR SELECT USING (
  owner_user_id = auth.uid()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 3 — FIX RLS payment_events
--   Gérant: ALL. Autres: SELECT si from/to/created_by.
--   Pas de policy UPDATE séparée pour les autres rôles.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS pe_all_gerant       ON public.payment_events;
DROP POLICY IF EXISTS pe_select_involved  ON public.payment_events;
DROP POLICY IF EXISTS pe_update_gerant    ON public.payment_events;

CREATE POLICY pe_all_gerant ON public.payment_events FOR ALL USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'gerant'
);

CREATE POLICY pe_select_involved ON public.payment_events FOR SELECT USING (
  from_user_id = auth.uid()
  OR to_user_id = auth.uid()
  OR created_by = auth.uid()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 4 — REBUILD fn_payment_event_paid (version stable)
--   • Amounts toujours positifs
--   • entry_type toujours 'payer_debit' | 'receiver_credit'
--   • Guard idempotence: skip si ledger déjà créé pour ce payment_event_id
--   • SECURITY DEFINER: bypass RLS pour les inserts
--   • Manager alert dans un bloc EXCEPTION pour ne pas bloquer si table absente
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_payment_event_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_title      text;
  v_from_name  text;
  v_to_name    text;
  v_existing   int := 0;
BEGIN
  -- Guard 1: Only fire when status transitions TO 'paid'
  IF NOT (NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status <> 'paid')) THEN
    RETURN NEW;
  END IF;

  -- Guard 2: Idempotence — skip if ledger entries already exist for this payment
  SELECT COUNT(*) INTO v_existing
    FROM public.ledger_entries
    WHERE payment_event_id = NEW.id;

  IF v_existing > 0 THEN
    RETURN NEW;
  END IF;

  -- Resolve title and display names
  v_title := COALESCE(NEW.title, NEW.kind, 'Paiement interne');

  SELECT COALESCE(full_name, username, display_name, 'Inconnu')
    INTO v_from_name
    FROM public.profiles
    WHERE id = NEW.from_user_id;

  SELECT COALESCE(full_name, username, display_name, 'Inconnu')
    INTO v_to_name
    FROM public.profiles
    WHERE id = NEW.to_user_id;

  -- ── 1. Ledger: PAYER DEBIT (amount positif, entry_type = 'payer_debit') ──
  INSERT INTO public.ledger_entries (
    created_by,
    owner_user_id,
    counterparty_user_id,
    entry_type,
    amount,
    currency,
    title,
    note,
    payment_event_id
  ) VALUES (
    NEW.created_by,
    NEW.from_user_id,    -- payer owns this entry
    NEW.to_user_id,
    'payer_debit',
    NEW.amount,          -- TOUJOURS POSITIF
    NEW.currency,
    v_title,
    COALESCE(NEW.note, ''),
    NEW.id
  );

  -- ── 2. Ledger: RECEIVER CREDIT (amount positif, entry_type = 'receiver_credit') ──
  INSERT INTO public.ledger_entries (
    created_by,
    owner_user_id,
    counterparty_user_id,
    entry_type,
    amount,
    currency,
    title,
    note,
    payment_event_id
  ) VALUES (
    NEW.created_by,
    NEW.to_user_id,      -- receiver owns this entry
    NEW.from_user_id,
    'receiver_credit',
    NEW.amount,          -- TOUJOURS POSITIF
    NEW.currency,
    v_title,
    COALESCE(NEW.note, ''),
    NEW.id
  );

  -- ── 3. Notification pour le receiver ──
  INSERT INTO public.notifications (user_id, type, title, message, read)
  VALUES (
    NEW.to_user_id,
    'payment_received',
    v_title || ' 💸',
    'Paiement reçu de ' || COALESCE(v_from_name, '?') || ' : ' ||
      NEW.amount::text || ' ' || NEW.currency,
    false
  );

  -- ── 4. Manager alert (optionnel, ne bloque pas si table absente) ──
  BEGIN
    INSERT INTO public.manager_alerts (type, message, payload)
    VALUES (
      'payment_paid',
      '💸 <b>Paiement effectué</b>' || E'\n' ||
        'De : ' || COALESCE(v_from_name, '?') || ' → ' || COALESCE(v_to_name, '?') || E'\n' ||
        'Montant : <b>' || NEW.amount::text || ' ' || NEW.currency || '</b>' || E'\n' ||
        'Type : ' || COALESCE(NEW.kind, '-') ||
        CASE WHEN NEW.note IS NOT NULL AND NEW.note <> ''
             THEN E'\n' || 'Note : ' || NEW.note
             ELSE ''
        END,
      jsonb_build_object(
        'payment_event_id', NEW.id,
        'from_user_id',     NEW.from_user_id,
        'to_user_id',       NEW.to_user_id,
        'amount',           NEW.amount,
        'currency',         NEW.currency,
        'kind',             NEW.kind
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- manager_alerts might not exist in all environments — silently ignore
    NULL;
  END;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 5 — REBIND TRIGGERS
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_payment_event_paid        ON public.payment_events;
DROP TRIGGER IF EXISTS trg_payment_event_paid_insert ON public.payment_events;

-- Fire on UPDATE (gérant mark as paid)
CREATE TRIGGER trg_payment_event_paid
  AFTER UPDATE ON public.payment_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_payment_event_paid();

-- Fire on INSERT if already status='paid' (bulk import edge case)
CREATE TRIGGER trg_payment_event_paid_insert
  AFTER INSERT ON public.payment_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_payment_event_paid();

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 6 — VERIFICATION QUERIES (run manually to confirm)
-- ─────────────────────────────────────────────────────────────────────────────

-- Check: no negative amounts
-- SELECT COUNT(*) FROM public.ledger_entries WHERE amount <= 0;
-- Should return 0.

-- Check: only canonical entry_types
-- SELECT DISTINCT entry_type FROM public.ledger_entries;
-- Should return only 'payer_debit' and/or 'receiver_credit'.

-- Check: trigger exists
-- SELECT tgname, tgenabled FROM pg_trigger WHERE tgname LIKE 'trg_payment_event_paid%';

-- Check: constraint exists
-- SELECT conname FROM pg_constraint WHERE conname = 'ledger_entries_amount_check';

COMMIT;
