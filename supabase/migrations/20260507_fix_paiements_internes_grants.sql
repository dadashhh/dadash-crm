-- =============================================================================
-- MIGRATION: Fix complet paiements_internes (GRANTs + fonction + policies)
-- Date: 2026-05-07
--
-- Problem: INSERT fails with "new row violates row-level security policy"
-- Root causes (multiple):
--   1. GRANT INSERT/UPDATE/DELETE missing on table
--   2. _get_my_role() function possibly not deployed or stale
--   3. RLS policies possibly not deployed to production
--
-- This migration is fully idempotent and safe to re-run.
-- =============================================================================

-- ─── 1. FUNCTION _get_my_role() ─────────────────────────────────────────────
-- SECURITY DEFINER bypasses RLS on profiles to read current user's role.

CREATE OR REPLACE FUNCTION public._get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS 'SELECT role FROM public.profiles WHERE id = auth.uid()';

GRANT EXECUTE ON FUNCTION public._get_my_role() TO authenticated;

-- ─── 2. TABLE-LEVEL GRANTS ──────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paiements_internes TO authenticated;

-- ─── 3. RLS ENABLED ─────────────────────────────────────────────────────────

ALTER TABLE public.paiements_internes ENABLE ROW LEVEL SECURITY;

-- ─── 4. DROP ALL POLICIES (clean slate) ─────────────────────────────────────

DROP POLICY IF EXISTS pi_gerant_all           ON public.paiements_internes;
DROP POLICY IF EXISTS pi_destinataire_select  ON public.paiements_internes;
DROP POLICY IF EXISTS pi_provider_select      ON public.paiements_internes;
DROP POLICY IF EXISTS pi_provider_insert      ON public.paiements_internes;
DROP POLICY IF EXISTS pi_destinataire_contest ON public.paiements_internes;
DROP POLICY IF EXISTS "paiements_internes_select" ON public.paiements_internes;
DROP POLICY IF EXISTS "paiements_internes_all"    ON public.paiements_internes;
DROP POLICY IF EXISTS "paiements_internes_insert" ON public.paiements_internes;

-- ─── 5. RECREATE ALL POLICIES ───────────────────────────────────────────────

-- 5a. Gerant / admin / ceo : full CRUD
CREATE POLICY pi_gerant_all ON public.paiements_internes
  FOR ALL TO authenticated
  USING     (public._get_my_role() IN ('gerant', 'admin', 'ceo'))
  WITH CHECK (public._get_my_role() IN ('gerant', 'admin', 'ceo'));

-- 5b. Chatter / modele : read own received payments
CREATE POLICY pi_destinataire_select ON public.paiements_internes
  FOR SELECT TO authenticated
  USING (destinataire_id = auth.uid());

-- 5c. Provider : read own sent payments
CREATE POLICY pi_provider_select ON public.paiements_internes
  FOR SELECT TO authenticated
  USING (createur_id = auth.uid()::text AND createur_role = 'provider');

-- 5d. Provider : insert reversements to gerant only
CREATE POLICY pi_provider_insert ON public.paiements_internes
  FOR INSERT TO authenticated
  WITH CHECK (
    public._get_my_role() = 'provider'
    AND createur_id       = auth.uid()::text
    AND createur_role     = 'provider'
    AND destinataire_type = 'gerant'
  );

-- 5e. Destinataire : can contest own received payments
CREATE POLICY pi_destinataire_contest ON public.paiements_internes
  FOR UPDATE TO authenticated
  USING     (destinataire_id = auth.uid())
  WITH CHECK (destinataire_id = auth.uid());

-- ─── 6. VIEW GRANTS ─────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'vue_soldes_chatters' AND schemaname = 'public') THEN
    GRANT SELECT ON public.vue_soldes_chatters TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'vue_soldes_modeles' AND schemaname = 'public') THEN
    GRANT SELECT ON public.vue_soldes_modeles TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'vue_soldes_providers' AND schemaname = 'public') THEN
    GRANT SELECT ON public.vue_soldes_providers TO authenticated;
  END IF;
END $$;
