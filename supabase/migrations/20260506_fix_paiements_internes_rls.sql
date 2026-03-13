-- =============================================================================
-- MIGRATION: Fix paiements_internes RLS policies
-- Date: 2026-05-06
-- Problem: After modifying RLS policies, neither gerants nor chatters can see
--          paiements_internes history. Root causes:
--   1. _get_my_role() may not be deployed or may be stale
--   2. RLS policies may not have been applied to production
--   3. Frontend was querying dropped tables (payment_events/ledger_entries)
--
-- Fix:
--   A. Re-create _get_my_role() as SECURITY DEFINER (idempotent)
--   B. Ensure RLS is enabled on paiements_internes
--   C. Drop + recreate all 5 RLS policies with correct logic
--   D. GRANT SELECT on views to authenticated
--
-- Safe to re-run: fully idempotent (DROP IF EXISTS + CREATE OR REPLACE)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. HELPER _get_my_role() — SECURITY DEFINER bypasses RLS on profiles
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS 'SELECT role FROM public.profiles WHERE id = auth.uid()';

GRANT EXECUTE ON FUNCTION public._get_my_role() TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Ensure RLS is enabled
-- -----------------------------------------------------------------------------

ALTER TABLE public.paiements_internes ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. Drop all existing policies (clean slate)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS pi_gerant_all           ON public.paiements_internes;
DROP POLICY IF EXISTS pi_destinataire_select  ON public.paiements_internes;
DROP POLICY IF EXISTS pi_provider_select      ON public.paiements_internes;
DROP POLICY IF EXISTS pi_provider_insert      ON public.paiements_internes;
DROP POLICY IF EXISTS pi_destinataire_contest ON public.paiements_internes;

-- Also drop any legacy policy names that may exist
DROP POLICY IF EXISTS "paiements_internes_select" ON public.paiements_internes;
DROP POLICY IF EXISTS "paiements_internes_all"    ON public.paiements_internes;
DROP POLICY IF EXISTS "paiements_internes_insert" ON public.paiements_internes;

-- -----------------------------------------------------------------------------
-- 4. Recreate policies
-- -----------------------------------------------------------------------------

-- 4a. Gerant / admin / ceo : full access (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY pi_gerant_all ON public.paiements_internes
  FOR ALL TO authenticated
  USING     (public._get_my_role() IN ('gerant', 'admin', 'ceo'))
  WITH CHECK (public._get_my_role() IN ('gerant', 'admin', 'ceo'));

-- 4b. Chatter / modele : can read their own received payments
CREATE POLICY pi_destinataire_select ON public.paiements_internes
  FOR SELECT TO authenticated
  USING (destinataire_id = auth.uid());

-- 4c. Provider : can read their own outgoing payments
CREATE POLICY pi_provider_select ON public.paiements_internes
  FOR SELECT TO authenticated
  USING (createur_id = auth.uid()::text AND createur_role = 'provider');

-- 4d. Provider : can create reversements (deposits) to gerant only
CREATE POLICY pi_provider_insert ON public.paiements_internes
  FOR INSERT TO authenticated
  WITH CHECK (
    public._get_my_role() = 'provider'
    AND createur_id       = auth.uid()::text
    AND createur_role     = 'provider'
    AND destinataire_type = 'gerant'
  );

-- 4e. Destinataire : can contest (update) their own received payments
CREATE POLICY pi_destinataire_contest ON public.paiements_internes
  FOR UPDATE TO authenticated
  USING     (destinataire_id = auth.uid())
  WITH CHECK (destinataire_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 5. Ensure views have proper grants
-- -----------------------------------------------------------------------------

GRANT SELECT ON public.paiements_internes TO authenticated;

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
  IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'v_soldes_chatters' AND schemaname = 'public') THEN
    GRANT SELECT ON public.v_soldes_chatters TO authenticated;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 6. Verification queries (run manually after migration)
-- -----------------------------------------------------------------------------
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'paiements_internes';
-- SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'paiements_internes';
-- SELECT COUNT(*) FROM paiements_internes;  -- as gerant, should see all
