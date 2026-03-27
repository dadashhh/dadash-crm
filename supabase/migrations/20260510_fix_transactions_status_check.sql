-- Fix: add 'cancelled' to transactions_status_check constraint
-- The app writes status = 'cancelled' when a TX is annulled,
-- but the CHECK constraint only allowed ('pending','validated','refused').

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_status_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_status_check
  CHECK (status IN ('pending', 'validated', 'refused', 'cancelled'));
