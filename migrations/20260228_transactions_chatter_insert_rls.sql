-- Fix: autoriser les chatters à insérer des transactions sur leurs modèles assignés
-- Ce script est idempotent (DROP IF EXISTS avant CREATE)

-- S'assurer que RLS est activée sur transactions
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Gérant : accès total
DROP POLICY IF EXISTS tx_all_gerant ON public.transactions;
CREATE POLICY tx_all_gerant ON public.transactions
  FOR ALL
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'gerant'
  );

-- Chatter : SELECT sur ses propres TX (chatter_id = lui-même)
DROP POLICY IF EXISTS tx_select_chatter ON public.transactions;
CREATE POLICY tx_select_chatter ON public.transactions
  FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'chatter'
    AND chatter_id = auth.uid()
  );

-- Chatter : INSERT autorisé (il assigne lui-même son chatter_id)
DROP POLICY IF EXISTS tx_insert_chatter ON public.transactions;
CREATE POLICY tx_insert_chatter ON public.transactions
  FOR INSERT
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'chatter'
  );

-- Chatter : UPDATE uniquement sur ses propres TX en statut pending
DROP POLICY IF EXISTS tx_update_chatter ON public.transactions;
CREATE POLICY tx_update_chatter ON public.transactions
  FOR UPDATE
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'chatter'
    AND chatter_id = auth.uid()
    AND status = 'pending'
  );

-- Provider : SELECT sur ses propres TX
DROP POLICY IF EXISTS tx_select_provider ON public.transactions;
CREATE POLICY tx_select_provider ON public.transactions
  FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'provider'
    AND provider_id = auth.uid()
  );

-- Provider : INSERT
DROP POLICY IF EXISTS tx_insert_provider ON public.transactions;
CREATE POLICY tx_insert_provider ON public.transactions
  FOR INSERT
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'provider'
  );

-- Service role : accès total (pour les triggers et le bot)
-- (le service_role bypass RLS par défaut dans Supabase — pas besoin de policy)
