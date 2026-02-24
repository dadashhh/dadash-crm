-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 20260228_profiles_messaging_permissions.sql
-- À exécuter manuellement si nécessaire
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Supprimer le default (évite erreur si colonne a des valeurs)
ALTER TABLE profiles ALTER COLUMN messaging_permissions DROP DEFAULT;

-- 2. Supprimer la colonne
ALTER TABLE profiles DROP COLUMN IF EXISTS messaging_permissions;
