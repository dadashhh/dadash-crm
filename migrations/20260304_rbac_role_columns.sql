-- ═══════════════════════════════════════════════════════════════════════
-- MIGRATION: RBAC — Role-Based Access Control columns on profiles table
-- Date: 2026-03-04
-- Context: Required for role-based filtering in the DADASH CRM frontend.
--          Adds role, model_id, provider_id to profiles if not present.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Add `role` column if it doesn't exist
--    Values: 'gerant' | 'chatter' | 'provider' | 'modele' | 'admin' | 'ceo'
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'chatter';

-- 2. Add `model_id` column if it doesn't exist
--    Links a chatter (or modele) to their primary model.
--    Note: multi-model chatters use assigned_models (UUID[]) instead.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES models(id) ON DELETE SET NULL;

-- 3. Add `provider_id` column if it doesn't exist
--    Self-referencing: for provider profiles this equals their own profiles.id.
--    Used to scope transaction queries to only this provider's transactions.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS provider_id UUID;

-- 4. Ensure the gérant (DADA) has role = 'gerant'
--    Replace <DADA_EMAIL> with the actual gérant email before running.
-- UPDATE profiles SET role = 'gerant' WHERE email = '<DADA_EMAIL>';

-- 5. Ensure existing provider profiles have provider_id = their own id
UPDATE profiles
  SET provider_id = id
  WHERE role = 'provider' AND provider_id IS NULL;

-- 6. RLS policies (Row Level Security) — enable for defense-in-depth
--    These complement the client-side RBAC in the frontend.

-- Enable RLS on transactions if not already enabled
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Gérant: full access
CREATE POLICY IF NOT EXISTS "transactions_gerant_all"
  ON transactions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('gerant', 'admin', 'ceo')
    )
  );

-- Chatter: can only see transactions where they are the chatter
--   OR where the model is one of their assigned models
CREATE POLICY IF NOT EXISTS "transactions_chatter_own"
  ON transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'chatter'
        AND (
          transactions.chatter_id = auth.uid()
          OR transactions.model_id = ANY(
            SELECT unnest(assigned_models) FROM profiles WHERE id = auth.uid()
          )
        )
    )
  );

-- Provider: can only see their own transactions
CREATE POLICY IF NOT EXISTS "transactions_provider_own"
  ON transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'provider'
        AND transactions.provider_id = auth.uid()
    )
  );

-- Enable RLS on spenders
ALTER TABLE spenders ENABLE ROW LEVEL SECURITY;

-- Gérant + Chatter: full access to spenders (chatters manage spenders)
CREATE POLICY IF NOT EXISTS "spenders_gerant_chatter"
  ON spenders FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('gerant', 'admin', 'ceo', 'chatter')
    )
  );

-- Provider: no access to spenders table
-- (no SELECT policy for providers → they see nothing)
