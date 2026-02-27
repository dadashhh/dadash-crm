-- PR2: Chatter payout requests table
CREATE TABLE IF NOT EXISTS public.payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chatter_user_id uuid NOT NULL,
  period_start date NULL,
  period_end date NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'CHF',
  status text NOT NULL DEFAULT 'requested',
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.payout_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payout_requests TO service_role;

ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY payout_requests_select_own ON public.payout_requests
  FOR SELECT USING (
    chatter_user_id = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('gerant', 'admin', 'ceo')
  );

CREATE POLICY payout_requests_insert_own ON public.payout_requests
  FOR INSERT WITH CHECK (chatter_user_id = auth.uid());

CREATE POLICY payout_requests_update_gerant ON public.payout_requests
  FOR UPDATE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('gerant', 'admin', 'ceo')
  );
