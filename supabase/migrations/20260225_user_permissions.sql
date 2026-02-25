-- ════════════════════════════════════════════════════════
-- Migration: user_permissions — Permissions par employé
-- Remplace la logique par rôle par des permissions individuelles
-- ════════════════════════════════════════════════════════

-- 1. Créer la table user_permissions
CREATE TABLE IF NOT EXISTS user_permissions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature    TEXT        NOT NULL,
  can_view   BOOLEAN     NOT NULL DEFAULT false,
  can_edit   BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, feature)
);

-- 2. Index pour les lookups par user_id
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);

-- 3. Activer RLS
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

-- 4. Policy: chaque user peut lire ses propres permissions
CREATE POLICY user_permissions_select_own ON user_permissions
  FOR SELECT
  USING (auth.uid() = user_id);

-- 5. Policy: le gérant a accès complet (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY user_permissions_all_gerant ON user_permissions
  FOR ALL
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
  );

-- 6. Commentaire
COMMENT ON TABLE user_permissions IS
  'Permissions individuelles par employé. Géré par le gérant. Fallback sur DEFAULT_ROLE_PERMISSIONS si aucune ligne.';
COMMENT ON COLUMN user_permissions.feature IS
  'Identifiant de la fonctionnalité: dashboard, business, equipe, messagerie, compta, automation, bots, admin, transactions, spenders, modeles, export, logs';
COMMENT ON COLUMN user_permissions.can_view IS
  'true → l''employé peut voir cette section';
COMMENT ON COLUMN user_permissions.can_edit IS
  'true → l''employé peut modifier (implique can_view)';
