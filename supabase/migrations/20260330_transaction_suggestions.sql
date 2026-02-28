-- ============================================================
-- Transaction Suggestions (AI human-in-the-loop)
-- AI writes suggestions here; CEO reviews via UI.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.transaction_suggestions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  spender_id      UUID,
  provider_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  amount          NUMERIC NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'CHF',
  suggested_date  TIMESTAMPTZ,
  suggestion_type TEXT NOT NULL CHECK (suggestion_type IN ('create', 'update')),
  field_changes   JSONB DEFAULT '{}',
  reason          TEXT,
  confidence      NUMERIC CHECK (confidence >= 0 AND confidence <= 1),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  source          TEXT,
  idempotency_key TEXT UNIQUE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tx_suggestions_status     ON public.transaction_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_tx_suggestions_created_at ON public.transaction_suggestions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_suggestions_idempotency ON public.transaction_suggestions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_tx_suggestions_spender    ON public.transaction_suggestions(spender_id);
CREATE INDEX IF NOT EXISTS idx_tx_suggestions_provider   ON public.transaction_suggestions(provider_id);

ALTER TABLE public.transaction_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read suggestions"
  ON public.transaction_suggestions FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can insert suggestions"
  ON public.transaction_suggestions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update suggestions"
  ON public.transaction_suggestions FOR UPDATE
  USING (auth.role() = 'authenticated');
