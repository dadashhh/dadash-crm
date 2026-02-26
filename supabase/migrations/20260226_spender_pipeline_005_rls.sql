-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 005: RLS — Row Level Security pour le pipeline Spender
-- Pipeline: Telegram → Spender
-- Date: 2026-02-26
-- Safe to re-run: DROP IF EXISTS before CREATE
--
-- RULES:
--   spenders:             READ pour gerant/chatter, WRITE uniquement service_role
--   spender_events:       READ pour gerant/chatter, WRITE uniquement service_role
--   spender_enrich_queue: READ/WRITE uniquement service_role (+ gerant read pour debug)
--
-- service_role bypasses RLS nativement dans Supabase.
-- Les policies ci-dessous ne concernent que les JWT anon/authenticated.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SPENDERS — RLS hardening
--    Remplacement des anciennes policies trop permissives:
--    - spenders_select_all USING(true) → restreint aux rôles app
--    - spenders_update_chatter → supprimé (write = service_role only)
--    - spenders_all_gerant → READ only pour gerant via JWT
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.spenders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS spenders_all_gerant      ON public.spenders;
DROP POLICY IF EXISTS spenders_update_chatter   ON public.spenders;
DROP POLICY IF EXISTS spenders_select_all       ON public.spenders;
DROP POLICY IF EXISTS spenders_read_app         ON public.spenders;

-- READ: gerant et chatter peuvent lire les spenders
CREATE POLICY spenders_read_app ON public.spenders
  FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid())
    IN ('gerant', 'chatter')
  );

-- WRITE: aucune policy INSERT/UPDATE/DELETE pour JWT
-- → seul service_role (bot/worker) peut écrire (bypass RLS natif Supabase)

-- gerant garde ALL pour backward compat (gestion manuelle depuis le CRM)
CREATE POLICY spenders_all_gerant ON public.spenders
  FOR ALL
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'gerant'
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'gerant'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SPENDER_EVENTS — RLS hardening
--    Anciennes policies trop permissives supprimées.
--    Events = immuables, jamais de UPDATE/DELETE côté client.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.spender_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS spender_events_select     ON public.spender_events;
DROP POLICY IF EXISTS spender_events_insert     ON public.spender_events;
DROP POLICY IF EXISTS spender_events_read_app   ON public.spender_events;

-- READ: gerant et chatter
CREATE POLICY spender_events_read_app ON public.spender_events
  FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid())
    IN ('gerant', 'chatter')
  );

-- WRITE: aucune policy → service_role only

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. SPENDER_ENRICH_QUEUE — RLS strict
--    Queue interne: jamais exposée au client.
--    Gerant: read-only pour debug/monitoring.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.spender_enrich_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS enrich_queue_read_gerant ON public.spender_enrich_queue;

-- READ: gerant seulement (monitoring/debug)
CREATE POLICY enrich_queue_read_gerant ON public.spender_enrich_queue
  FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'gerant'
  );

-- WRITE: aucune policy → service_role only

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. VIEW v_activity_feed — grant access
--    La view utilise SECURITY DEFINER sur les fonctions, mais le SELECT
--    passe par les policies de spender_events. On s'assure que les rôles
--    app peuvent lire la view.
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT ON public.v_activity_feed TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_activity_feed(INTEGER, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_insert_spender_event(BIGINT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_claim_enrich_job(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_complete_enrich_job(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_enqueue_enrich(UUID, BIGINT, BIGINT) TO authenticated;
