-- ═══════════════════════════════════════════════════════════════════════════
-- FIX DASHBOARD DATA — RLS + ledger gerant access + seed minimal
-- Date: 2026-03-11
-- Phase 1: résoudre "aucune data / widgets à 0"
--
-- CAUSES RACINES:
-- 1. ledger_entries: policy le_all_gerant manquante dans 20260310 → gerant ne voit rien
-- 2. notifications: policy UPDATE manquante (user ne peut pas marquer lu)
-- 3. Pas de données seed pour valider les widgets
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- PART 1 — Ledger: gerant DOIT voir toutes les entrées
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS le_all_gerant ON ledger_entries;
CREATE POLICY le_all_gerant ON ledger_entries FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

-- ─────────────────────────────────────────────────────────────────────────
-- PART 2 — Notifications: allow UPDATE (mark as read) by owner
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS notifications_update ON notifications;
CREATE POLICY notifications_update ON notifications FOR UPDATE USING (
  user_id = auth.uid()
);

-- ─────────────────────────────────────────────────────────────────────────
-- PART 3 — Payment_events: gerant ALL (ensure policy exists)
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS pe_all_gerant ON payment_events;
CREATE POLICY pe_all_gerant ON payment_events FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

-- ─────────────────────────────────────────────────────────────────────────
-- PART 4 — Seed minimal (idempotent — only if tables are empty)
-- Crée 1 spender + 2 TX validées pour prouver que le dashboard fonctionne
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_gerant_id uuid;
  v_model_id uuid;
  v_chatter_id uuid;
  v_tx_count int;
BEGIN
  SELECT COUNT(*) INTO v_tx_count FROM transactions;
  IF v_tx_count > 0 THEN
    RAISE NOTICE 'SKIP seed: transactions already contain % rows', v_tx_count;
    RETURN;
  END IF;

  SELECT id INTO v_gerant_id FROM profiles WHERE role = 'gerant' LIMIT 1;
  SELECT id INTO v_model_id FROM models LIMIT 1;
  SELECT id INTO v_chatter_id FROM profiles WHERE role = 'chatter' LIMIT 1;

  IF v_gerant_id IS NULL THEN
    RAISE NOTICE 'SKIP seed: no gerant profile found';
    RETURN;
  END IF;

  INSERT INTO spenders (handle, name, status, langue, classification)
  VALUES ('seed_spender', 'Seed Spender', 'active', 'FR', 'new')
  ON CONFLICT (handle) DO NOTHING;

  INSERT INTO transactions (date, spender_handle, amount, currency, status, model_id, chatter_id, net_amount, provider_fee, dada_fee, chatter_commission)
  VALUES
    (now() - interval '2 days', 'seed_spender', 150.00, 'CHF', 'validated', v_model_id, v_chatter_id, 120.00, 15.00, 15.00, 9.00),
    (now() - interval '1 day', 'seed_spender', 200.00, 'EUR', 'validated', v_model_id, v_chatter_id, 160.00, 20.00, 20.00, 12.00);

  RAISE NOTICE 'SEED: 2 TX validées créées pour seed_spender';
END $$;
