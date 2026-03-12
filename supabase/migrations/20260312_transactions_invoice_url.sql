-- Migration: Add invoice_url column to transactions table
-- Stores the URL/path of the generated PDF invoice for a transaction

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS invoice_url text;

COMMENT ON COLUMN transactions.invoice_url IS 'URL du PDF facture associé à cette transaction (généré par le provider)';
