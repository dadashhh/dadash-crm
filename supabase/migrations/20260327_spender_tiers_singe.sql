-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Spender Tiers "Singe" — hiérarchie automatique basée sur les TX validées
-- Date: 2026-03-27
-- Remplace: whale/vip/regular → timewaster/ouistiti/orang_outan/gorille
-- Safe to re-run: DROP IF EXISTS CASCADE, CREATE OR REPLACE
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. INDEX sur transactions pour accélérer les agrégats par spender + status
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_transactions_spender_id
  ON public.transactions (spender_id);

CREATE INDEX IF NOT EXISTS idx_transactions_status
  ON public.transactions (status);

CREATE INDEX IF NOT EXISTS idx_transactions_spender_status
  ON public.transactions (spender_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. DROP toutes les vues dépendantes (CASCADE) pour pouvoir les recréer
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_activity_feed CASCADE;
DROP VIEW IF EXISTS public.v_spenders_ui CASCADE;
DROP VIEW IF EXISTS public.v_spender_score CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. VIEW v_spender_score — agrège total_spent + tx_count_valid depuis transactions
--    Seules les TX status IN ('valid','validated','confirmee') comptent
-- ─────────────────────────────────────────────────────────────────────────────
CREATE VIEW public.v_spender_score AS
SELECT
  s.id AS spender_id,
  COALESCE(agg.total_spent, 0)      AS total_spent,
  COALESCE(agg.tx_count_valid, 0)   AS tx_count_valid,
  CASE
    WHEN COALESCE(agg.tx_count_valid, 0) = 0           THEN 'timewaster'
    WHEN COALESCE(agg.total_spent, 0) < 100             THEN 'ouistiti'
    WHEN COALESCE(agg.total_spent, 0) < 250             THEN 'orang_outan'
    ELSE                                                      'gorille'
  END AS tier,
  CASE
    WHEN COALESCE(agg.tx_count_valid, 0) = 0           THEN 'Timewaster'
    WHEN COALESCE(agg.total_spent, 0) < 100             THEN 'Ouistiti'
    WHEN COALESCE(agg.total_spent, 0) < 250             THEN 'Orang-outan'
    ELSE                                                      'Gorille'
  END AS tier_label,
  CASE
    WHEN COALESCE(agg.tx_count_valid, 0) = 0           THEN '💩'
    WHEN COALESCE(agg.total_spent, 0) < 100             THEN '🐒'
    WHEN COALESCE(agg.total_spent, 0) < 250             THEN '🦧'
    ELSE                                                      '🦍'
  END AS tier_icon,
  now() AS computed_at
FROM public.spenders s
LEFT JOIN (
  SELECT
    t.spender_id,
    SUM(t.amount)  AS total_spent,
    COUNT(*)       AS tx_count_valid
  FROM public.transactions t
  WHERE t.status IN ('valid', 'validated', 'confirmee')
  GROUP BY t.spender_id
) agg ON agg.spender_id = s.id;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. VIEW v_spenders_ui — profil normalisé + colonnes tier
-- ─────────────────────────────────────────────────────────────────────────────
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

  COALESCE(sc.total_spent, (s.meta->>'total_spent')::numeric, 0) AS total_spent,
  s.classification,
  s.source,
  s.telegram_username,
  s.whatsapp_phone,
  COALESCE(s.meta, '{}'::jsonb) AS meta,
  COALESCE(s.status, 'active') AS status,
  COALESCE(s.last_seen_at, s.updated_at, s.created_at, now()) AS last_activity_at,

  -- Colonnes tier "singe"
  COALESCE(sc.tier, 'timewaster')       AS tier,
  COALESCE(sc.tier_label, 'Timewaster') AS tier_label,
  COALESCE(sc.tier_icon, '💩')          AS tier_icon,
  COALESCE(sc.tx_count_valid, 0)        AS tx_count_valid

FROM public.spenders s
LEFT JOIN public.v_spender_score sc ON sc.spender_id = s.id
WHERE (
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'spenders'
      AND column_name = 'is_active'
  )
  OR s.is_active = true
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. VIEW v_activity_feed — recréée avec support spender_tier_changed
-- ─────────────────────────────────────────────────────────────────────────────
CREATE VIEW public.v_activity_feed AS
SELECT
  e.id,
  e.event_type,
  e.tg_user_id,
  COALESCE(s.handle, s.name, s.telegram_username, 'tg_' || e.tg_user_id::text)
    AS username,
  CASE e.event_type
    WHEN 'new_spender'            THEN 'Nouveau spender'
    WHEN 'profile_updated'        THEN 'Profil mis à jour'
    WHEN 'new_message'            THEN 'Nouveau message'
    WHEN 'status_changed'         THEN 'Statut changé'
    WHEN 'classification_changed' THEN 'Classification changée'
    WHEN 'spender_created'        THEN 'Spender créé'
    WHEN 'tx_created'             THEN 'Transaction créée'
    WHEN 'handle_set'             THEN 'Handle défini'
    WHEN 'spender_tier_changed'   THEN 'Tier changé'
    ELSE COALESCE(e.event_type, 'Événement')
  END AS title,
  COALESCE(
    e.data ->> 'summary',
    e.data ->> 'message',
    CASE
      WHEN e.data <> '{}'::jsonb THEN e.event_type || ' — ' || COALESCE(s.handle, 'tg_' || e.tg_user_id::text)
      ELSE NULL
    END
  ) AS subtitle,
  e.created_at,
  e.data
FROM public.spender_events e
LEFT JOIN public.spenders s
  ON s.tg_user_id = e.tg_user_id
ORDER BY e.created_at DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. GRANTS sur toutes les vues
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT ON public.v_spender_score TO authenticated;
GRANT SELECT ON public.v_spender_score TO service_role;
GRANT SELECT ON public.v_spenders_ui TO authenticated;
GRANT SELECT ON public.v_spenders_ui TO service_role;
GRANT SELECT ON public.v_activity_feed TO authenticated;
GRANT SELECT ON public.v_activity_feed TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. CHECK constraint pour accepter 'spender_tier_changed'
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.spender_events
  DROP CONSTRAINT IF EXISTS chk_spender_events_event_type;

ALTER TABLE public.spender_events
  ADD CONSTRAINT chk_spender_events_event_type
  CHECK (event_type IN (
    'new_spender',
    'profile_updated',
    'new_message',
    'status_changed',
    'classification_changed',
    'spender_created',
    'tx_created',
    'handle_set',
    'spender_tier_changed',
    'unknown'
  )) NOT VALID;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. RPC fn_refresh_spender_tier — recalcule le tier et insère un event si changé
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_refresh_spender_tier(p_spender_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score    RECORD;
  v_old_tier TEXT;
  v_spender  RECORD;
  v_result   JSONB;
BEGIN
  SELECT * INTO v_score FROM public.v_spender_score WHERE spender_id = p_spender_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'spender_not_found');
  END IF;

  SELECT * INTO v_spender FROM public.spenders WHERE id = p_spender_id;
  v_old_tier := COALESCE(v_spender.meta->'score'->>'tier', '');

  UPDATE public.spenders
  SET meta = jsonb_set(
    COALESCE(meta, '{}'::jsonb),
    '{score}',
    jsonb_build_object(
      'total_spent',     v_score.total_spent,
      'tx_count_valid',  v_score.tx_count_valid,
      'tier',            v_score.tier,
      'tier_label',      v_score.tier_label,
      'tier_icon',       v_score.tier_icon,
      'computed_at',     now()
    )
  )
  WHERE id = p_spender_id;

  v_result := jsonb_build_object(
    'ok', true,
    'tier', v_score.tier,
    'tier_label', v_score.tier_label,
    'tier_icon', v_score.tier_icon,
    'total_spent', v_score.total_spent,
    'changed', (v_old_tier IS DISTINCT FROM v_score.tier)
  );

  IF v_old_tier IS DISTINCT FROM v_score.tier AND v_old_tier <> '' THEN
    INSERT INTO public.spender_events (tg_user_id, event_type, idempotency_key, data)
    VALUES (
      COALESCE(v_spender.tg_user_id, 0),
      'spender_tier_changed',
      'tier_' || p_spender_id::text || '_' || v_score.tier || '_' || extract(epoch from now())::text,
      jsonb_build_object(
        'spender_id', p_spender_id,
        'old_tier', v_old_tier,
        'new_tier', v_score.tier,
        'new_tier_label', v_score.tier_label,
        'new_tier_icon', v_score.tier_icon,
        'total_spent', v_score.total_spent,
        'summary', COALESCE(v_spender.handle, v_spender.name, 'Spender') ||
                   ' est passé de ' || v_old_tier || ' à ' || v_score.tier ||
                   ' (' || v_score.tier_icon || ' ' || v_score.tier_label || ')'
      )
    );
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_refresh_spender_tier(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_refresh_spender_tier(UUID) TO service_role;
