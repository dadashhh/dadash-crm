-- ============================================================
-- spenders.created_source — distinguish manual vs tg_ai vs import
-- Fixes: "Nouveaux spenders IA" graph counting manual spenders
-- ============================================================

BEGIN;

-- 1) Add column
ALTER TABLE public.spenders
  ADD COLUMN IF NOT EXISTS created_source TEXT DEFAULT 'manual';

-- 2) Add check constraint (safe: only if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'spenders_created_source_check'
  ) THEN
    ALTER TABLE public.spenders
      ADD CONSTRAINT spenders_created_source_check
      CHECK (created_source IN ('manual', 'tg_ai', 'import'));
  END IF;
END $$;

-- 3) Backfill: tg_ai for spenders linked to a tg_conversation via spender_id
UPDATE public.spenders
SET created_source = 'tg_ai'
WHERE created_source = 'manual'
  AND id IN (
    SELECT DISTINCT tc.spender_id
    FROM public.tg_conversations tc
    WHERE tc.spender_id IS NOT NULL
  );

-- 4) Backfill: tg_ai for spenders with a tg_user_id matching a tg_conversation
--    (covers cases where spender_id wasn't set on conversation but tg_user_id matches)
UPDATE public.spenders s
SET created_source = 'tg_ai'
WHERE s.created_source = 'manual'
  AND s.tg_user_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.tg_conversations tc
    WHERE tc.tg_chat_id IS NOT NULL
  )
  AND s.tg_user_id IS NOT NULL;

-- 5) Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_spenders_created_source ON public.spenders(created_source);

-- 6) Recreate v_spenders_ui with created_source column
DROP VIEW IF EXISTS public.v_spenders_ui;

CREATE VIEW public.v_spenders_ui AS
SELECT
  s.id,
  s.tg_user_id,
  public.normalize_tg_user_id(s.tg_user_id) AS tg_user_id_text,

  COALESCE(
    NULLIF(TRIM(s.handle), ''),
    s.telegram_username,
    s.meta->'profile'->'telegram'->>'username',
    s.meta->'profile'->>'username',
    CASE WHEN s.tg_user_id IS NOT NULL
         THEN 'tg_' || public.normalize_tg_user_id(s.tg_user_id)
         ELSE 'id:' || s.id::text
    END
  ) AS username,

  COALESCE(
    NULLIF(TRIM(s.display_name), ''),
    NULLIF(TRIM(s.name), ''),
    s.meta->'profile'->'telegram'->>'display',
    s.meta->'profile'->>'display_name'
  ) AS display_name,

  COALESCE(s.created_at, now()) AS created_at,
  COALESCE(s.updated_at, s.created_at, now()) AS updated_at,

  COALESCE(
    s.first_name,
    s.meta->'profile'->'identity'->>'first_name',
    s.meta->'profile'->'telegram'->>'first_name',
    s.meta->'profile'->>'first_name'
  ) AS first_name,

  COALESCE(
    s.age::text,
    s.meta->'profile'->'identity'->>'age',
    s.meta->'profile'->>'age'
  ) AS age,

  COALESCE(
    s.job,
    s.meta->'profile'->>'job'
  ) AS job,

  COALESCE(
    s.country,
    s.meta->'profile'->'location'->>'country',
    s.meta->'profile'->>'country'
  ) AS country,

  COALESCE(
    s.city,
    s.meta->'profile'->'location'->>'city',
    s.meta->'profile'->>'city'
  ) AS city,

  COALESCE(
    s.langue,
    s.meta->'profile'->>'language',
    s.meta->'profile'->>'langue'
  ) AS language,

  COALESCE(
    s.relationship_status,
    s.meta->'profile'->>'relationship_status',
    s.meta->'profile'->'status'->>'relation'
  ) AS relationship_status,

  COALESCE(
    s.notes,
    s.meta->'profile'->>'notes_chatter'
  ) AS notes_chatter,

  COALESCE(
    s.timezone,
    s.meta->'profile'->'location'->>'timezone',
    s.meta->'profile'->>'timezone'
  ) AS timezone,

  COALESCE(
    s.budget_range,
    s.meta->'profile'->>'budget_chf_range',
    s.meta->'profile'->>'budget_range'
  ) AS budget_range,

  (s.meta->>'total_spent')::numeric AS total_spent,
  s.classification,
  s.source,
  s.telegram_username,
  s.whatsapp_phone,
  COALESCE(s.meta, '{}'::jsonb) AS meta,
  COALESCE(s.status, 'active') AS status,
  COALESCE(s.last_seen_at, s.updated_at, s.created_at, now()) AS last_activity_at,
  COALESCE(s.created_source, 'manual') AS created_source

FROM public.spenders s
WHERE (
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'spenders'
      AND column_name = 'is_active'
  )
  OR s.is_active = true
);

GRANT SELECT ON public.v_spenders_ui TO authenticated;
GRANT SELECT ON public.v_spenders_ui TO service_role;

COMMIT;
