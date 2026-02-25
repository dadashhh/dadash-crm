-- ============================================================
-- DADASH CRM — Expenses: devise + assignation
-- ============================================================
-- Adds currency, assigned_to_id, assigned_to_type columns
-- to the expenses table.
-- Idempotent (IF NOT EXISTS).
-- ============================================================

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS currency        TEXT DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS assigned_to_id  UUID,
  ADD COLUMN IF NOT EXISTS assigned_to_type TEXT;

COMMENT ON COLUMN expenses.currency          IS 'Devise de la dépense: EUR | CHF | USD';
COMMENT ON COLUMN expenses.assigned_to_id    IS 'UUID du chatter ou modèle assigné';
COMMENT ON COLUMN expenses.assigned_to_type  IS 'Type de l''entité assignée: chatter | model';

CREATE INDEX IF NOT EXISTS idx_expenses_assigned_to
  ON expenses (assigned_to_type, assigned_to_id)
  WHERE assigned_to_id IS NOT NULL;
