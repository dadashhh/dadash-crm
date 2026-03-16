-- =============================================
-- MIGRATION: media_library — missing columns + RLS fix
-- Date: 2026-03-16
-- Context:
--   1. Original migration (20260305_media_library.sql) only defined
--      id, user_id, name, type, url, file_size, usage_count, tags, created_at.
--      The app inserts model, category, filename, album_id, size — add them.
--   2. RLS only allowed gerant/admin/ceo — chatters need READ to use LibraryModal.
-- =============================================

-- ── 1. ADD MISSING COLUMNS (safe: IF NOT EXISTS) ──────────────────────────

ALTER TABLE media_library ADD COLUMN IF NOT EXISTS model        text;
ALTER TABLE media_library ADD COLUMN IF NOT EXISTS category     text DEFAULT 'Autres';
ALTER TABLE media_library ADD COLUMN IF NOT EXISTS filename     text;
ALTER TABLE media_library ADD COLUMN IF NOT EXISTS album_id     uuid;
ALTER TABLE media_library ADD COLUMN IF NOT EXISTS size         bigint;

-- Index on model for fast filtering in LibraryModal
CREATE INDEX IF NOT EXISTS idx_media_library_model    ON media_library(model);
CREATE INDEX IF NOT EXISTS idx_media_library_category ON media_library(category);
CREATE INDEX IF NOT EXISTS idx_media_library_album    ON media_library(album_id);


-- ── 2. RLS — allow chatters + all authenticated roles to READ ─────────────
--    (gerant already has full access via media_lib_gerant_all)

DROP POLICY IF EXISTS "media_lib_chatter_read" ON media_library;

CREATE POLICY "media_lib_chatter_read" ON media_library
  FOR SELECT USING (
    auth.uid() IS NOT NULL
  );

-- Note: INSERT/UPDATE/DELETE remain restricted to gerant via media_lib_gerant_all.
-- The SELECT policy above allows any authenticated user to read, which is
-- intentional — chatters need to browse the library to send media.
