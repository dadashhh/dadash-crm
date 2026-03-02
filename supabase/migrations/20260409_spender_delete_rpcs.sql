-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Spender Delete RPCs (soft + hard) + __DELETED__ fallback
-- Date: 2026-04-09
-- Objectif: permettre la suppression fiable de N'IMPORTE quel spender sans
--           bloquer sur les FK, via deux RPC sécurisées (SECURITY DEFINER).
--
-- Tables FK connues sur spenders.id :
--   transactions.spender_id        (nullable, ON DELETE RESTRICT par défaut)
--   tg_conversations.spender_id    (nullable)
--   spender_events.spender_id      (nullable)
--   push_recipients.spender_id     (NOT NULL, ON DELETE RESTRICT → doit être reassigné)
--   platform_fans.spender_id       (nullable, ON DELETE SET NULL)
--   spender_badges.spender_id      (ON DELETE CASCADE → auto)
--   wa_analysis_logs.spender_id    (nullable si existe)
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Ajouter deleted_at sur spenders (soft-delete tracking)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_spenders_deleted_at
  ON public.spenders (deleted_at) WHERE deleted_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Recréer v_spenders_ui pour exclure les soft-deleted (deleted_at IS NOT NULL)
--    tout en conservant le filtre existant is_active
-- ─────────────────────────────────────────────────────────────────────────────
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

  COALESCE(s.job, s.meta->'profile'->>'job') AS job,

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

  COALESCE(s.notes, s.meta->'profile'->>'notes_chatter') AS notes_chatter,

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
WHERE s.deleted_at IS NULL
  AND s.handle IS DISTINCT FROM '__DELETED__'
  AND (
    NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'spenders'
        AND column_name = 'is_active'
    )
    OR s.is_active IS DISTINCT FROM false
  );

GRANT SELECT ON public.v_spenders_ui TO authenticated;
GRANT SELECT ON public.v_spenders_ui TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Spender fallback __DELETED__ — receveur de toutes les FK avant hard delete
--    Idempotent: INSERT si absent, sinon réutilise l'existant.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.spenders WHERE handle = '__DELETED__') INTO v_exists;
  IF NOT v_exists THEN
    INSERT INTO public.spenders (handle, name, status, source, deleted_at, updated_at, created_at)
    VALUES ('__DELETED__', '__DELETED__', 'inactive', 'system_fallback', now(), now(), now());
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. rpc_spenders_soft_delete(p_spender_id UUID) → JSONB
--    Soft-delete: pose deleted_at + is_active=false. Réversible.
--    La fiche disparaît de v_spenders_ui immédiatement.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_spenders_soft_delete(p_spender_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handle TEXT;
BEGIN
  -- Sécurité: ne pas soft-delete le spender fallback système
  SELECT handle INTO v_handle FROM public.spenders WHERE id = p_spender_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'spender_not_found');
  END IF;
  IF v_handle = '__DELETED__' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_delete_system_fallback');
  END IF;

  UPDATE public.spenders
     SET deleted_at  = now(),
         updated_at  = now()
   WHERE id = p_spender_id;

  RETURN jsonb_build_object('ok', true, 'spender_id', p_spender_id, 'mode', 'soft');
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_spenders_soft_delete(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. rpc_spenders_hard_delete(p_spender_id UUID) → JSONB
--    Hard-delete sans FK blocage:
--      1. Récupère l'id du spender __DELETED__ (fallback)
--      2. Réassigne toutes les FK connues vers __DELETED__
--      3. Supprime le spender original
--    Les transactions restent visibles, liées à __DELETED__.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_spenders_hard_delete(p_spender_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fallback_id   UUID;
  v_handle        TEXT;
  v_tx            INT := 0;
  v_conv          INT := 0;
  v_ev            INT := 0;
  v_push          INT := 0;
  v_plat          INT := 0;
  v_wa            INT := 0;
  v_badges        INT := 0;
BEGIN
  -- Sécurité: ne pas supprimer le spender fallback système
  SELECT handle INTO v_handle FROM public.spenders WHERE id = p_spender_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'spender_not_found');
  END IF;
  IF v_handle = '__DELETED__' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_delete_system_fallback');
  END IF;

  -- Récupérer le spender fallback __DELETED__
  SELECT id INTO v_fallback_id FROM public.spenders WHERE handle = '__DELETED__';
  IF v_fallback_id IS NULL THEN
    -- Créer le fallback à la volée si absent (ne devrait pas arriver après la migration)
    INSERT INTO public.spenders (handle, name, status, source, deleted_at, updated_at, created_at)
    VALUES ('__DELETED__', '__DELETED__', 'inactive', 'system_fallback', now(), now(), now())
    RETURNING id INTO v_fallback_id;
  END IF;

  -- Réassigner toutes les FK connues → __DELETED__

  -- transactions.spender_id (nullable FK)
  UPDATE public.transactions
     SET spender_id = v_fallback_id
   WHERE spender_id = p_spender_id;
  GET DIAGNOSTICS v_tx = ROW_COUNT;

  -- tg_conversations.spender_id (nullable FK)
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'tg_conversations') THEN
    UPDATE public.tg_conversations SET spender_id = v_fallback_id WHERE spender_id = p_spender_id;
    GET DIAGNOSTICS v_conv = ROW_COUNT;
  END IF;

  -- spender_events.spender_id (nullable FK)
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'spender_events') THEN
    UPDATE public.spender_events SET spender_id = v_fallback_id WHERE spender_id = p_spender_id;
    GET DIAGNOSTICS v_ev = ROW_COUNT;
  END IF;

  -- push_recipients.spender_id (NOT NULL FK — réassigner obligatoire avant delete)
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'push_recipients') THEN
    UPDATE public.push_recipients SET spender_id = v_fallback_id WHERE spender_id = p_spender_id;
    GET DIAGNOSTICS v_push = ROW_COUNT;
  END IF;

  -- platform_fans.spender_id (nullable, ON DELETE SET NULL — déjà safe mais on réassigne)
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'platform_fans') THEN
    UPDATE public.platform_fans SET spender_id = v_fallback_id WHERE spender_id = p_spender_id;
    GET DIAGNOSTICS v_plat = ROW_COUNT;
  END IF;

  -- wa_analysis_logs.spender_id (si existe)
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'wa_analysis_logs') THEN
    UPDATE public.wa_analysis_logs SET spender_id = v_fallback_id WHERE spender_id = p_spender_id;
    GET DIAGNOSTICS v_wa = ROW_COUNT;
  END IF;

  -- spender_badges: ON DELETE CASCADE → auto, pas besoin de réassigner
  SELECT COUNT(*) INTO v_badges FROM public.spender_badges WHERE spender_id = p_spender_id;

  -- Supprimer le spender (toutes FK réassignées — ne devrait plus y avoir de RESTRICT)
  DELETE FROM public.spenders WHERE id = p_spender_id;

  RETURN jsonb_build_object(
    'ok',          true,
    'spender_id',  p_spender_id,
    'mode',        'hard',
    'fallback_id', v_fallback_id,
    'reassigned',  jsonb_build_object(
      'transactions',    v_tx,
      'tg_conversations', v_conv,
      'spender_events',  v_ev,
      'push_recipients', v_push,
      'platform_fans',   v_plat,
      'wa_analysis_logs', v_wa,
      'badges_deleted',  v_badges
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_spenders_hard_delete(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS: seuls les gérants peuvent appeler ces fonctions
--    (SECURITY DEFINER contourne RLS des tables, mais on valide le rôle ici)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_spenders_soft_delete(p_spender_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role  TEXT;
  v_handle TEXT;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('gerant', 'admin', 'ceo') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT handle INTO v_handle FROM public.spenders WHERE id = p_spender_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'spender_not_found');
  END IF;
  IF v_handle = '__DELETED__' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_delete_system_fallback');
  END IF;

  UPDATE public.spenders
     SET deleted_at = now(),
         updated_at = now()
   WHERE id = p_spender_id;

  RETURN jsonb_build_object('ok', true, 'spender_id', p_spender_id, 'mode', 'soft');
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_spenders_hard_delete(p_spender_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role        TEXT;
  v_fallback_id UUID;
  v_handle      TEXT;
  v_tx          INT := 0;
  v_conv        INT := 0;
  v_ev          INT := 0;
  v_push        INT := 0;
  v_plat        INT := 0;
  v_wa          INT := 0;
  v_badges      INT := 0;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('gerant', 'admin', 'ceo') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT handle INTO v_handle FROM public.spenders WHERE id = p_spender_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'spender_not_found');
  END IF;
  IF v_handle = '__DELETED__' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_delete_system_fallback');
  END IF;

  SELECT id INTO v_fallback_id FROM public.spenders WHERE handle = '__DELETED__';
  IF v_fallback_id IS NULL THEN
    INSERT INTO public.spenders (handle, name, status, source, deleted_at, updated_at, created_at)
    VALUES ('__DELETED__', '__DELETED__', 'inactive', 'system_fallback', now(), now(), now())
    RETURNING id INTO v_fallback_id;
  END IF;

  UPDATE public.transactions SET spender_id = v_fallback_id WHERE spender_id = p_spender_id;
  GET DIAGNOSTICS v_tx = ROW_COUNT;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tg_conversations') THEN
    UPDATE public.tg_conversations SET spender_id = v_fallback_id WHERE spender_id = p_spender_id;
    GET DIAGNOSTICS v_conv = ROW_COUNT;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='spender_events') THEN
    UPDATE public.spender_events SET spender_id = v_fallback_id WHERE spender_id = p_spender_id;
    GET DIAGNOSTICS v_ev = ROW_COUNT;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='push_recipients') THEN
    UPDATE public.push_recipients SET spender_id = v_fallback_id WHERE spender_id = p_spender_id;
    GET DIAGNOSTICS v_push = ROW_COUNT;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='platform_fans') THEN
    UPDATE public.platform_fans SET spender_id = v_fallback_id WHERE spender_id = p_spender_id;
    GET DIAGNOSTICS v_plat = ROW_COUNT;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='wa_analysis_logs') THEN
    UPDATE public.wa_analysis_logs SET spender_id = v_fallback_id WHERE spender_id = p_spender_id;
    GET DIAGNOSTICS v_wa = ROW_COUNT;
  END IF;

  SELECT COUNT(*) INTO v_badges FROM public.spender_badges WHERE spender_id = p_spender_id;

  DELETE FROM public.spenders WHERE id = p_spender_id;

  RETURN jsonb_build_object(
    'ok', true, 'spender_id', p_spender_id, 'mode', 'hard',
    'fallback_id', v_fallback_id,
    'reassigned', jsonb_build_object(
      'transactions', v_tx, 'tg_conversations', v_conv,
      'spender_events', v_ev, 'push_recipients', v_push,
      'platform_fans', v_plat, 'wa_analysis_logs', v_wa,
      'badges_deleted', v_badges
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_spenders_soft_delete(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_spenders_hard_delete(UUID)  TO authenticated;

COMMIT;
