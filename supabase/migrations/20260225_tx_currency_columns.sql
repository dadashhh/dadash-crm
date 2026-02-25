-- ============================================================
-- DADASH CRM — Transactions: devise EUR/CHF + montant original
-- ============================================================
-- Ajoute les colonnes currency, amount_original, currency_original
-- à la table transactions.
-- Idempotent (IF NOT EXISTS).
-- ============================================================

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS currency          TEXT    DEFAULT 'CHF',
  ADD COLUMN IF NOT EXISTS amount_original   NUMERIC,
  ADD COLUMN IF NOT EXISTS currency_original TEXT;

-- Backfill : les TX existantes sans devise → CHF par défaut
UPDATE transactions
  SET currency = 'CHF'
  WHERE currency IS NULL;

-- Backfill amount_original pour les TX existantes
UPDATE transactions
  SET amount_original   = amount,
      currency_original = COALESCE(currency, 'CHF')
  WHERE amount_original IS NULL;

COMMENT ON COLUMN transactions.currency          IS 'Devise de la transaction : CHF | EUR';
COMMENT ON COLUMN transactions.amount_original   IS 'Montant saisi dans la devise originale';
COMMENT ON COLUMN transactions.currency_original IS 'Devise dans laquelle le montant a été saisi';
