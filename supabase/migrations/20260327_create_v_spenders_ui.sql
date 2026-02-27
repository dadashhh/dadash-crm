-- ═══════════════════════════════════════════════════════════════════════════════
-- v_spenders_ui — Vue stable pour la fiche spender dans le CRM
-- Date: 2026-03-27
-- Objectif: exposer un profil normalisé lisible directement par le frontend,
--           sans besoin de mapCanonToSpender ou parsing JSON côté JS.
--           Fallback NULL si champ absent. 1 ligne par spender garanti.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

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

  -- Profil: colonne top-level prioritaire → meta->'profile' → NULL
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
  COALESCE(s.last_seen_at, s.updated_at, s.created_at, now()) AS last_activity_at

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
