-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: safe_delete_spender — RPC unifiée (soft ou hard)
-- Date: 2026-04-10
-- Objectif: point d'entrée unique pour supprimer n'importe quel spender
--           sans jamais bloquer sur les FK.
--
-- Comportement:
--   soft (défaut) : deleted_at = now() → disparaît de v_spenders_ui
--   hard          : réassigne toutes FK vers __DELETED__, puis DELETE
--
-- Sécurité: SECURITY DEFINER, vérifie role IN ('gerant','admin','ceo')
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Pré-requis: s'assurer que deleted_at existe (safe si déjà fait)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────────────────────
-- Spender fallback __DELETED__ (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.spenders WHERE handle = '__DELETED__') THEN
    INSERT INTO public.spenders (handle, name, status, source, deleted_at, updated_at, created_at)
    VALUES ('__DELETED__', '__DELETED__', 'inactive', 'system_fallback', now(), now(), now());
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- safe_delete_spender(spender_id, mode)
-- mode: 'soft' (défaut) | 'hard'
-- Returns: JSONB { ok, mode, spender_id, ... }
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.safe_delete_spender(
  p_spender_id UUID,
  p_mode       TEXT DEFAULT 'soft'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role        TEXT;
  v_handle      TEXT;
  v_fallback_id UUID;
  v_tx          INT := 0;
  v_conv        INT := 0;
  v_ev          INT := 0;
  v_push        INT := 0;
  v_plat        INT := 0;
  v_wa          INT := 0;
BEGIN
  -- ── Vérification du rôle ──────────────────────────────────────────────────
  SELECT role INTO v_role
  FROM   public.profiles
  WHERE  id = auth.uid();

  IF v_role NOT IN ('gerant', 'admin', 'ceo') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized',
                              'role', COALESCE(v_role, 'unknown'));
  END IF;

  -- ── Vérification que le spender existe ────────────────────────────────────
  SELECT handle INTO v_handle
  FROM   public.spenders
  WHERE  id = p_spender_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'spender_not_found',
                              'spender_id', p_spender_id);
  END IF;

  -- Protection du spender système __DELETED__
  IF v_handle = '__DELETED__' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_delete_system_fallback');
  END IF;

  -- ── SOFT DELETE ────────────────────────────────────────────────────────────
  IF p_mode = 'soft' THEN
    UPDATE public.spenders
       SET deleted_at = now(),
           updated_at = now()
     WHERE id = p_spender_id;

    RETURN jsonb_build_object(
      'ok',         true,
      'mode',       'soft',
      'spender_id', p_spender_id,
      'handle',     v_handle
    );
  END IF;

  -- ── HARD DELETE ────────────────────────────────────────────────────────────
  -- Récupérer le fallback __DELETED__
  SELECT id INTO v_fallback_id
  FROM   public.spenders
  WHERE  handle = '__DELETED__';

  IF v_fallback_id IS NULL THEN
    INSERT INTO public.spenders (handle, name, status, source, deleted_at, updated_at, created_at)
    VALUES ('__DELETED__', '__DELETED__', 'inactive', 'system_fallback', now(), now(), now())
    RETURNING id INTO v_fallback_id;
  END IF;

  -- Réassigner toutes les FK connues vers __DELETED__

  UPDATE public.transactions SET spender_id = v_fallback_id
  WHERE  spender_id = p_spender_id;
  GET DIAGNOSTICS v_tx = ROW_COUNT;

  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'tg_conversations') THEN
    UPDATE public.tg_conversations SET spender_id = v_fallback_id
    WHERE  spender_id = p_spender_id;
    GET DIAGNOSTICS v_conv = ROW_COUNT;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'spender_events') THEN
    UPDATE public.spender_events SET spender_id = v_fallback_id
    WHERE  spender_id = p_spender_id;
    GET DIAGNOSTICS v_ev = ROW_COUNT;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'push_recipients') THEN
    UPDATE public.push_recipients SET spender_id = v_fallback_id
    WHERE  spender_id = p_spender_id;
    GET DIAGNOSTICS v_push = ROW_COUNT;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'platform_fans') THEN
    UPDATE public.platform_fans SET spender_id = v_fallback_id
    WHERE  spender_id = p_spender_id;
    GET DIAGNOSTICS v_plat = ROW_COUNT;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'wa_analysis_logs') THEN
    UPDATE public.wa_analysis_logs SET spender_id = v_fallback_id
    WHERE  spender_id = p_spender_id;
    GET DIAGNOSTICS v_wa = ROW_COUNT;
  END IF;

  -- spender_badges → CASCADE automatique à la suppression

  -- Supprimer le spender (toutes FK réassignées)
  DELETE FROM public.spenders WHERE id = p_spender_id;

  RETURN jsonb_build_object(
    'ok',          true,
    'mode',        'hard',
    'spender_id',  p_spender_id,
    'handle',      v_handle,
    'fallback_id', v_fallback_id,
    'reassigned',  jsonb_build_object(
      'transactions',     v_tx,
      'tg_conversations', v_conv,
      'spender_events',   v_ev,
      'push_recipients',  v_push,
      'platform_fans',    v_plat,
      'wa_analysis_logs', v_wa
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.safe_delete_spender(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Recréer v_spenders_ui (filtre deleted_at + __DELETED__) si elle n'a pas
-- encore ce filtre (migration idempotente)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_spenders_ui AS
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
         ELSE 'id:' || s.id::text END
  ) AS username,

  COALESCE(
    NULLIF(TRIM(s.display_name), ''),
    NULLIF(TRIM(s.name), ''),
    s.meta->'profile'->'telegram'->>'display',
    s.meta->'profile'->>'display_name'
  ) AS display_name,

  COALESCE(s.created_at, now()) AS created_at,
  COALESCE(s.updated_at, s.created_at, now()) AS updated_at,

  COALESCE(s.first_name,
           s.meta->'profile'->'identity'->>'first_name',
           s.meta->'profile'->'telegram'->>'first_name',
           s.meta->'profile'->>'first_name') AS first_name,

  COALESCE(s.age::text, s.meta->'profile'->'identity'->>'age',
           s.meta->'profile'->>'age') AS age,

  COALESCE(s.job, s.meta->'profile'->>'job') AS job,

  COALESCE(s.country, s.meta->'profile'->'location'->>'country',
           s.meta->'profile'->>'country') AS country,

  COALESCE(s.city, s.meta->'profile'->'location'->>'city',
           s.meta->'profile'->>'city') AS city,

  COALESCE(s.langue, s.meta->'profile'->>'language',
           s.meta->'profile'->>'langue') AS language,

  COALESCE(s.relationship_status,
           s.meta->'profile'->>'relationship_status',
           s.meta->'profile'->'status'->>'relation') AS relationship_status,

  COALESCE(s.notes, s.meta->'profile'->>'notes_chatter') AS notes_chatter,

  COALESCE(s.timezone, s.meta->'profile'->'location'->>'timezone',
           s.meta->'profile'->>'timezone') AS timezone,

  COALESCE(s.budget_range, s.meta->'profile'->>'budget_chf_range',
           s.meta->'profile'->>'budget_range') AS budget_range,

  (s.meta->>'total_spent')::numeric AS total_spent,
  s.classification,
  s.source,
  s.telegram_username,
  s.whatsapp_phone,
  COALESCE(s.meta, '{}'::jsonb) AS meta,
  COALESCE(s.status, 'active') AS status,
  COALESCE(s.last_seen_at, s.updated_at, s.created_at, now()) AS last_activity_at

FROM public.spenders s
WHERE s.deleted_at IS NULL
  AND s.handle IS DISTINCT FROM '__DELETED__'
  AND (
    NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'spenders'
        AND column_name = 'is_active'
    )
    OR s.is_active IS DISTINCT FROM false
  );

GRANT SELECT ON public.v_spenders_ui TO authenticated;
GRANT SELECT ON public.v_spenders_ui TO service_role;

COMMIT;
