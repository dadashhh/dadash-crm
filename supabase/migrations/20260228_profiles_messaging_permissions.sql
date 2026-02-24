-- ═══════════════════════════════════════════════════════════════════════════════
-- feat/messaging-permissions-column
-- Ajout colonne messaging_permissions (jsonb) à profiles
-- Permissions fines des chatters pour la messagerie Telegram
-- Date: 2026-02-28
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- SPÉCIFICATION:
--   - Colonne: messaging_permissions jsonb
--   - Default: { can_send, can_close, can_assign, can_view_all_assigned }
--   - Migration idempotente (ADD COLUMN IF NOT EXISTS)
--   - Backfill des lignes existantes où la colonne est null
--   - Pas de RLS dans cette PR
--
-- ROLLBACK: voir fin du fichier
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Ajout de la colonne (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS messaging_permissions jsonb;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Définition du default pour les futures insertions
-- ─────────────────────────────────────────────────────────────────────────────

-- Default recommandé pour nouveaux profils (chatter typique)
-- can_send: true  — peut envoyer des messages
-- can_close: false — ne peut pas fermer une conversation (réservé gérant)
-- can_assign: false — ne peut pas assigner à un autre chatter
-- can_view_all_assigned: true — voit toutes les convs de ses modèles assignés
ALTER TABLE profiles
ALTER COLUMN messaging_permissions
SET DEFAULT '{"can_send": true, "can_close": false, "can_assign": false, "can_view_all_assigned": true}'::jsonb;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Backfill des lignes existantes où messaging_permissions est null
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE profiles
SET messaging_permissions = '{"can_send": true, "can_close": false, "can_assign": false, "can_view_all_assigned": true}'::jsonb
WHERE messaging_permissions IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Commentaire sur la colonne (documentation)
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN profiles.messaging_permissions IS 'Permissions messagerie: can_send, can_close, can_assign, can_view_all_assigned (jsonb)';

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (exécuter manuellement si nécessaire)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ALTER TABLE profiles ALTER COLUMN messaging_permissions DROP DEFAULT;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS messaging_permissions;
--
-- ═══════════════════════════════════════════════════════════════════════════════
