-- ═══════════════════════════════════════════════════════════════════════════
-- TESTS PAIEMENTS / LEDGER — Exécuter après migration 20260310
-- Copier-coller dans SQL Editor Supabase (sans placeholders)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Récupérer 2 profiles (gerant + chatter)
DO $$
DECLARE
  v_gerant_id uuid;
  v_chatter_id uuid;
  v_pe_id uuid;
  v_le_count int;
  v_notif_count int;
  v_balance numeric;
BEGIN
  SELECT id INTO v_gerant_id FROM profiles WHERE role = 'gerant' LIMIT 1;
  SELECT id INTO v_chatter_id FROM profiles WHERE role = 'chatter' AND id != v_gerant_id LIMIT 1;
  
  IF v_gerant_id IS NULL OR v_chatter_id IS NULL THEN
    RAISE NOTICE 'SKIP: besoin d''au moins 1 gerant et 1 chatter dans profiles';
    RETURN;
  END IF;

  -- 2) Créer payment_event pending (kind requis si colonne existe)
  INSERT INTO payment_events (from_user_id, to_user_id, amount, currency, kind, title, note, status, created_by)
  VALUES (v_gerant_id, v_chatter_id, 50.00, 'CHF', 'salary', 'Test paiement', 'Test migration', 'pending', v_gerant_id)
  RETURNING id INTO v_pe_id;

  RAISE NOTICE 'Payment event créé: %', v_pe_id;

  -- 3) Mark paid
  UPDATE payment_events SET status = 'paid' WHERE id = v_pe_id;

  -- 4) Vérifier 2 ledger_entries
  SELECT COUNT(*) INTO v_le_count FROM ledger_entries WHERE payment_event_id = v_pe_id;
  IF v_le_count != 2 THEN
    RAISE EXCEPTION 'FAIL: attendu 2 ledger_entries, obtenu %', v_le_count;
  END IF;
  RAISE NOTICE 'OK: 2 ledger_entries créées';

  -- 5) Vérifier 1 notification
  SELECT COUNT(*) INTO v_notif_count FROM notifications WHERE user_id = v_chatter_id AND type = 'payment_paid';
  IF v_notif_count < 1 THEN
    RAISE EXCEPTION 'FAIL: attendu au moins 1 notification pour chatter';
  END IF;
  RAISE NOTICE 'OK: notification créée';

  -- 6) Vérifier balance receiver > 0
  SELECT SUM(CASE WHEN entry_type = 'debit' THEN -amount ELSE amount END) INTO v_balance
  FROM ledger_entries WHERE owner_user_id = v_chatter_id;
  IF v_balance IS NULL OR v_balance <= 0 THEN
    RAISE EXCEPTION 'FAIL: balance chatter devrait être > 0, obtenu %', v_balance;
  END IF;
  RAISE NOTICE 'OK: balance chatter = %', v_balance;

  RAISE NOTICE '=== TOUS LES TESTS PASSÉS ===';
END $$;
