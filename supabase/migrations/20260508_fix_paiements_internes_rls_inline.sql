-- =============================================================================
-- MIGRATION: Fix paiements_internes RLS — inline subquery (no function dependency)
-- Date: 2026-05-08
-- Problem: RLS error "new row violates row-level security policy" when gérant
--          creates a payment to chatter. Root cause: pi_gerant_all policy depends
--          on _get_my_role() function which may be stale/missing/not deployed.
--          The provider_payouts table works because it uses inline subqueries.
--
-- Fix: Replace _get_my_role() calls with inline subqueries in all policies,
--      matching the pattern used by provider_payouts (which works).
--      Also ensure all table-level GRANTs are in place.
--
-- Safe to re-run: fully idempotent (DROP IF EXISTS + CREATE OR REPLACE)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Ensure _get_my_role() exists (keep for backward compat, but policies
--    will no longer depend on it)
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
-- 3. Drop ALL existing policies (clean slate)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS pi_gerant_all           ON public.paiements_internes;
DROP POLICY IF EXISTS pi_destinataire_select  ON public.paiements_internes;
DROP POLICY IF EXISTS pi_provider_select      ON public.paiements_internes;
DROP POLICY IF EXISTS pi_provider_insert      ON public.paiements_internes;
DROP POLICY IF EXISTS pi_destinataire_contest ON public.paiements_internes;

-- Also drop any legacy policy names
DROP POLICY IF EXISTS "paiements_internes_select" ON public.paiements_internes;
DROP POLICY IF EXISTS "paiements_internes_all"    ON public.paiements_internes;
DROP POLICY IF EXISTS "paiements_internes_insert" ON public.paiements_internes;

-- -----------------------------------------------------------------------------
-- 4. Recreate policies using INLINE SUBQUERIES (no function dependency)
--    Pattern matches provider_payouts which works correctly.
-- -----------------------------------------------------------------------------

-- 4a. Gerant / admin / ceo : full access (SELECT, INSERT, UPDATE, DELETE)
--     Uses inline subquery instead of _get_my_role() to avoid function dependency
CREATE POLICY pi_gerant_all ON public.paiements_internes
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid())
    IN ('gerant', 'admin', 'ceo')
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid())
    IN ('gerant', 'admin', 'ceo')
  );

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
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'provider'
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
-- 5. Ensure ALL table-level GRANTs exist (SELECT + INSERT + UPDATE + DELETE)
-- -----------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paiements_internes TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. Ensure views have proper grants
-- -----------------------------------------------------------------------------

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
-- 7. Verification queries (run manually after migration)
-- -----------------------------------------------------------------------------
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'paiements_internes';
-- SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'paiements_internes';
-- INSERT INTO paiements_internes (createur_role, createur_id, createur_name, destinataire_type, destinataire_id, destinataire_name, type, montant, statut)
--   VALUES ('gerant', auth.uid()::text, 'test', 'chatter', '<chatter-uuid>', 'test-chatter', 'commission', 100, 'pending');
-- ^ This should succeed when run as gérant
