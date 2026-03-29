-- ============================================================
-- MIGRATION CHF-ONLY — 29/03/2026
-- Taux fixe EUR→CHF = 0.90, USD→CHF = 0.88
-- Décision DADA : plus de conversion live, tout en CHF
-- ============================================================

-- 1. Ajouter les colonnes
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS amount_chf NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS net_amount_chf NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS exchange_rate_used NUMERIC(6,4);

-- 2. Backfill TX CHF (300 TX — déjà en CHF, taux = 1)
UPDATE transactions
SET amount_chf = amount,
    net_amount_chf = net_amount,
    exchange_rate_used = 1.0000
WHERE (currency = 'CHF' OR currency IS NULL)
AND amount_chf IS NULL;

-- 3. Backfill TX EUR (93 TX — taux fixe 0.90)
UPDATE transactions
SET amount_chf = ROUND(amount * 0.90, 2),
    net_amount_chf = ROUND(COALESCE(net_amount, amount * 0.78) * 0.90, 2),
    exchange_rate_used = 0.9000
WHERE currency = 'EUR'
AND amount_chf IS NULL;

-- 4. Backfill TX USD (si existantes — taux fixe 0.88)
UPDATE transactions
SET amount_chf = ROUND(amount * 0.88, 2),
    net_amount_chf = ROUND(COALESCE(net_amount, amount * 0.78) * 0.88, 2),
    exchange_rate_used = 0.8800
WHERE currency = 'USD'
AND amount_chf IS NULL;

-- 5. Trigger auto pour futures TX
CREATE OR REPLACE FUNCTION set_amount_chf()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.currency = 'CHF' OR NEW.currency IS NULL THEN
    NEW.amount_chf := NEW.amount;
    NEW.net_amount_chf := NEW.net_amount;
    NEW.exchange_rate_used := 1.0000;
  ELSIF NEW.currency = 'EUR' THEN
    NEW.exchange_rate_used := 0.9000;
    NEW.amount_chf := ROUND(NEW.amount * 0.9000, 2);
    NEW.net_amount_chf := ROUND(COALESCE(NEW.net_amount, NEW.amount * 0.78) * 0.9000, 2);
  ELSIF NEW.currency = 'USD' THEN
    NEW.exchange_rate_used := 0.8800;
    NEW.amount_chf := ROUND(NEW.amount * 0.8800, 2);
    NEW.net_amount_chf := ROUND(COALESCE(NEW.net_amount, NEW.amount * 0.78) * 0.8800, 2);
  ELSE
    -- Devise inconnue : on prend le montant brut
    NEW.amount_chf := NEW.amount;
    NEW.net_amount_chf := NEW.net_amount;
    NEW.exchange_rate_used := 1.0000;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Supprimer l'ancien trigger s'il existe
DROP TRIGGER IF EXISTS trg_set_amount_chf ON transactions;

-- Créer le trigger
CREATE TRIGGER trg_set_amount_chf
BEFORE INSERT OR UPDATE OF amount, net_amount, currency
ON transactions
FOR EACH ROW
EXECUTE FUNCTION set_amount_chf();

-- 6. Vérification post-migration
-- SELECT currency, count(*),
--        count(amount_chf) as has_chf,
--        count(*) - count(amount_chf) as missing_chf
-- FROM transactions
-- GROUP BY currency;
