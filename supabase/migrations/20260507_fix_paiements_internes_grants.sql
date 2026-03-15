-- =============================================================================
-- MIGRATION: Fix paiements_internes table-level GRANTs
-- Date: 2026-05-07
-- Problem: Only GRANT SELECT existed on paiements_internes.
--          INSERT, UPDATE, DELETE were never granted to authenticated role.
--          This caused ALL write operations to fail regardless of RLS policies:
--            - Gerants could not create payments (commission, bonus, etc.)
--            - Providers could not declare reversements
--            - Nobody could validate, contest, or cancel payments
--          RLS policies (pi_gerant_all, pi_provider_insert, etc.) were correct
--          but could not take effect without table-level permissions.
--
-- Fix: Add missing GRANT INSERT, UPDATE, DELETE on paiements_internes
--      to the authenticated role.
--
-- Safe to re-run: GRANTs are idempotent.
-- =============================================================================

-- Grant all necessary DML operations to authenticated users.
-- Row-level access is controlled by the existing RLS policies:
--   pi_gerant_all          (FOR ALL)    -> gerant/admin/ceo
--   pi_provider_insert     (FOR INSERT) -> provider -> gerant only
--   pi_destinataire_select (FOR SELECT) -> recipients see own payments
--   pi_provider_select     (FOR SELECT) -> providers see own payments
--   pi_destinataire_contest(FOR UPDATE) -> recipients can contest

GRANT INSERT, UPDATE, DELETE ON public.paiements_internes TO authenticated;
