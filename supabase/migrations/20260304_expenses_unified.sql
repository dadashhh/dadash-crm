-- ════════════════════════════════════════════════════════
-- Migration: expenses — Unification (type + paid + paid_at)
-- Ajoute les colonnes nécessaires pour alimenter Compta > Paies
-- currency / assigned_to_id / assigned_to_type déjà présents
-- via migration 20260301_expenses_assign_devise.sql
-- ════════════════════════════════════════════════════════

-- 1. Colonnes métier
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS type    TEXT DEFAULT 'autre',
  ADD COLUMN IF NOT EXISTS paid    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

COMMENT ON COLUMN expenses.type    IS 'Type de dépense : salaire | marketing | outil | reversement | autre';
COMMENT ON COLUMN expenses.paid    IS 'true = règlement effectué';
COMMENT ON COLUMN expenses.paid_at IS 'Horodatage du règlement';

-- 2. Index par type (filtrage Paies + P&L)
CREATE INDEX IF NOT EXISTS idx_expenses_type
  ON expenses (type);

-- 3. Index partiel pour retrouver rapidement les salaires non payés
CREATE INDEX IF NOT EXISTS idx_expenses_salaire_unpaid
  ON expenses (assigned_to_id)
  WHERE type = 'salaire' AND paid = false;
