-- Allow manager_chatter users to declare their own transactions without widening chatter rights.
-- Local-only until Supabase MCP auth is restored; apply as a targeted migration after live review.
-- Does not toggle global transactions RLS; existing admin/gerant/chatter policies stay authoritative.

ALTER TABLE public.profiles
  ALTER COLUMN manager_commission_pct SET DEFAULT 12.00;

UPDATE public.profiles
SET manager_commission_pct = 12.00
WHERE role = 'manager_chatter';

DROP POLICY IF EXISTS tx_select_manager_chatter_self ON public.transactions;
CREATE POLICY tx_select_manager_chatter_self ON public.transactions
  FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'manager_chatter'
    AND chatter_id = auth.uid()
  );

DROP POLICY IF EXISTS tx_insert_manager_chatter_self ON public.transactions;
CREATE POLICY tx_insert_manager_chatter_self ON public.transactions
  FOR INSERT
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'manager_chatter'
    AND chatter_id = auth.uid()
  );

DROP POLICY IF EXISTS tx_update_manager_chatter_self_pending ON public.transactions;
CREATE POLICY tx_update_manager_chatter_self_pending ON public.transactions
  FOR UPDATE
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'manager_chatter'
    AND chatter_id = auth.uid()
    AND status = 'pending'
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'manager_chatter'
    AND chatter_id = auth.uid()
    AND status = 'pending'
  );
