-- ════════════════════════════════════════════════════════
-- Migration: user_permissions RLS fix — Permissions toggle
-- Ensures table + policies are correctly set for gerant upsert
-- ════════════════════════════════════════════════════════

-- 1. Ensure table exists (idempotent)
CREATE TABLE IF NOT EXISTS user_permissions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature    TEXT        NOT NULL,
  can_view   BOOLEAN     NOT NULL DEFAULT false,
  can_edit   BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, feature)
);

-- 2. Index for lookups by user_id (idempotent)
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);

-- 3. Enable RLS (safe to run if already enabled)
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

-- 4. Drop existing policies (so we can recreate cleanly)
DROP POLICY IF EXISTS user_permissions_select_own       ON user_permissions;
DROP POLICY IF EXISTS user_permissions_all_gerant       ON user_permissions;
DROP POLICY IF EXISTS gerant_manage_permissions         ON user_permissions;

-- 5. SELECT: each user can read their own permissions
CREATE POLICY user_permissions_select_own ON user_permissions
  FOR SELECT
  USING (auth.uid() = user_id);

-- 6. ALL: gérant has full read/write access on all rows
--    Explicit WITH CHECK ensures INSERT + UPDATE are also covered
CREATE POLICY gerant_manage_permissions ON user_permissions
  FOR ALL
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
  );
