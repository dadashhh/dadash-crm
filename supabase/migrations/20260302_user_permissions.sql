-- ============================================================
-- DADASH CRM — user_permissions (override de rôle par utilisateur)
-- ============================================================
-- Permet au gérant d'accorder des accès custom à un utilisateur
-- précis, indépendamment des permissions par rôle.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_permissions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature        TEXT        NOT NULL,
  can_view       BOOLEAN     NOT NULL DEFAULT false,
  can_edit       BOOLEAN     NOT NULL DEFAULT false,
  overrides_role BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, feature)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id
  ON user_permissions (user_id);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

-- L'utilisateur peut voir ses propres permissions
-- Le gérant peut voir toutes les permissions
CREATE POLICY "select_user_permissions" ON user_permissions
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'gerant'
    )
  );

-- Seul le gérant peut insérer
CREATE POLICY "gerant_insert_user_permissions" ON user_permissions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'gerant'
    )
  );

-- Seul le gérant peut modifier
CREATE POLICY "gerant_update_user_permissions" ON user_permissions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'gerant'
    )
  );

-- Seul le gérant peut supprimer
CREATE POLICY "gerant_delete_user_permissions" ON user_permissions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'gerant'
    )
  );

-- updated_at auto-trigger
CREATE OR REPLACE FUNCTION set_user_permissions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_user_permissions_updated_at ON user_permissions;
CREATE TRIGGER trg_user_permissions_updated_at
  BEFORE UPDATE ON user_permissions
  FOR EACH ROW EXECUTE FUNCTION set_user_permissions_updated_at();
