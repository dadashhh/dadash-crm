-- ═══════════════════════════════════════════════════════════════════════════════
-- v_spenders — Ajout relationship_status + telegram_id (compat enrichissements)
-- Fix: enrichissements Telegram (age, city, job, relation, etc.) visibles dans le CRM
-- Date: 2026-02-27
-- Safe: additive, pas de DROP de colonnes
-- ═══════════════════════════════════════════════════════════════════════════════

-- Colonnes spenders si manquantes (additive)
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS relationship_status TEXT;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS telegram_id TEXT;

-- Recréer v_spenders avec relationship_status + telegram_id (compat legacy)
-- Note: si une migration ultérieure (20260313) a ajouté is_active, on préserve la structure
-- en ajoutant les colonnes manquantes. On utilise une approche qui fonctionne avec ou sans is_active.
DO $$
BEGIN
  -- Si la table spenders a is_active, on filtre ; sinon on affiche tout
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'spenders' AND column_name = 'is_active'
  ) THEN
    DROP VIEW IF EXISTS public.v_spenders;
    CREATE VIEW public.v_spenders AS
    SELECT
      s.id,
      s.tg_user_id,
      COALESCE(s.telegram_id, s.tg_user_id::text) AS telegram_id,
      COALESCE(NULLIF(TRIM(s.handle), ''), s.telegram_username, s.meta->'profile'->'telegram'->>'username', CASE WHEN s.tg_user_id IS NOT NULL THEN 'tg_' || s.tg_user_id::text ELSE 'id:' || s.id::text END) AS username,
      COALESCE(NULLIF(TRIM(s.handle), ''), s.telegram_username, s.meta->'profile'->'telegram'->>'username', CASE WHEN s.tg_user_id IS NOT NULL THEN 'tg_' || s.tg_user_id::text ELSE 'id:' || s.id::text END) AS handle,
      COALESCE(NULLIF(TRIM(s.display_name), ''), NULLIF(TRIM(s.name), ''), s.meta->'profile'->'telegram'->>'display') AS display_name,
      COALESCE(NULLIF(TRIM(s.display_name), ''), NULLIF(TRIM(s.name), ''), s.meta->'profile'->'telegram'->>'display') AS name,
      COALESCE(s.first_name, s.meta->'profile'->'identity'->>'first_name', s.meta->'profile'->'telegram'->>'first_name', s.meta->'profile'->>'first_name') AS first_name,
      COALESCE(s.age, (s.meta->'profile'->'identity'->>'age')::int, (s.meta->'profile'->>'age')::int) AS age,
      COALESCE(s.job, s.meta->'profile'->>'job') AS job,
      COALESCE(s.city, s.meta->'profile'->'location'->>'city', s.meta->'profile'->>'city') AS city,
      COALESCE(s.country, s.meta->'profile'->'location'->>'country', s.meta->'profile'->>'country') AS country,
      COALESCE(s.langue, s.meta->'profile'->>'language', s.meta->'profile'->>'langue') AS language,
      COALESCE(s.notes, s.meta->'profile'->>'notes_chatter') AS notes,
      COALESCE(s.relationship_status, s.meta->'profile'->>'relationship_status', (s.meta->'profile'->'status'->>'relation')) AS relationship_status,
      COALESCE(s.meta, '{}'::jsonb) AS meta,
      COALESCE(s.status, 'active') AS status,
      s.telegram_username,
      s.whatsapp_phone,
      s.classification,
      s.source,
      COALESCE(s.created_at, now()) AS created_at,
      COALESCE(s.updated_at, s.created_at, now()) AS updated_at,
      COALESCE(s.last_seen_at, s.updated_at, s.created_at, now()) AS last_activity_at
    FROM public.spenders s
    WHERE s.is_active = true;
  ELSE
    DROP VIEW IF EXISTS public.v_spenders;
    CREATE VIEW public.v_spenders AS
    SELECT
      s.id,
      s.tg_user_id,
      COALESCE(s.telegram_id, s.tg_user_id::text) AS telegram_id,
      COALESCE(NULLIF(TRIM(s.handle), ''), s.telegram_username, s.meta->'profile'->'telegram'->>'username', CASE WHEN s.tg_user_id IS NOT NULL THEN 'tg_' || s.tg_user_id::text ELSE 'id:' || s.id::text END) AS username,
      COALESCE(NULLIF(TRIM(s.handle), ''), s.telegram_username, s.meta->'profile'->'telegram'->>'username', CASE WHEN s.tg_user_id IS NOT NULL THEN 'tg_' || s.tg_user_id::text ELSE 'id:' || s.id::text END) AS handle,
      COALESCE(NULLIF(TRIM(s.display_name), ''), NULLIF(TRIM(s.name), ''), s.meta->'profile'->'telegram'->>'display') AS display_name,
      COALESCE(NULLIF(TRIM(s.display_name), ''), NULLIF(TRIM(s.name), ''), s.meta->'profile'->'telegram'->>'display') AS name,
      COALESCE(s.first_name, s.meta->'profile'->'identity'->>'first_name', s.meta->'profile'->'telegram'->>'first_name', s.meta->'profile'->>'first_name') AS first_name,
      COALESCE(s.age, (s.meta->'profile'->'identity'->>'age')::int, (s.meta->'profile'->>'age')::int) AS age,
      COALESCE(s.job, s.meta->'profile'->>'job') AS job,
      COALESCE(s.city, s.meta->'profile'->'location'->>'city', s.meta->'profile'->>'city') AS city,
      COALESCE(s.country, s.meta->'profile'->'location'->>'country', s.meta->'profile'->>'country') AS country,
      COALESCE(s.langue, s.meta->'profile'->>'language', s.meta->'profile'->>'langue') AS language,
      COALESCE(s.notes, s.meta->'profile'->>'notes_chatter') AS notes,
      COALESCE(s.relationship_status, s.meta->'profile'->>'relationship_status', (s.meta->'profile'->'status'->>'relation')) AS relationship_status,
      COALESCE(s.meta, '{}'::jsonb) AS meta,
      COALESCE(s.status, 'active') AS status,
      s.telegram_username,
      s.whatsapp_phone,
      s.classification,
      s.source,
      COALESCE(s.created_at, now()) AS created_at,
      COALESCE(s.updated_at, s.created_at, now()) AS updated_at,
      COALESCE(s.last_seen_at, s.updated_at, s.created_at, now()) AS last_activity_at
    FROM public.spenders s;
  END IF;
END $$;

GRANT SELECT ON public.v_spenders TO authenticated;
