-- ═══════════════════════════════════════════════════════════════════════════════
-- Fiche Spender — Nouveaux champs ANALYSE : interest_notes, strategy_notes, risk_notes
-- Date: 2026-03-04
-- Objectif: ajouter 3 colonnes top-level sur la table spenders et les exposer
--           dans v_spenders_ui pour la section "🧠 ANALYSE" de la fiche CRM.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Colonnes top-level sur spenders ──────────────────────────────────────
ALTER TABLE public.spenders
  ADD COLUMN IF NOT EXISTS interest_notes  TEXT,
  ADD COLUMN IF NOT EXISTS strategy_notes TEXT,
  ADD COLUMN IF NOT EXISTS risk_notes     TEXT;

-- ── 2. Mise à jour de v_spenders_ui ─────────────────────────────────────────
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
  COALESCE(s.created_source, 'manual') AS created_source,

  -- personality_notes : colonne top-level prioritaire → meta->'profile' → NULL
  COALESCE(
    s.personality_notes,
    (s.meta->'profile'->>'personality_notes')
  ) AS personality_notes,

  -- interest_notes : intérêts détectés / saisis manuellement
  COALESCE(
    s.interest_notes,
    (s.meta->'profile'->>'interest_notes')
  ) AS interest_notes,

  -- strategy_notes : stratégie de monétisation recommandée
  COALESCE(
    s.strategy_notes,
    (s.meta->'profile'->>'strategy_notes')
  ) AS strategy_notes,

  -- risk_notes : risques identifiés (refund, chargeback, comportement suspect…)
  COALESCE(
    s.risk_notes,
    (s.meta->'profile'->>'risk_notes')
  ) AS risk_notes

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
