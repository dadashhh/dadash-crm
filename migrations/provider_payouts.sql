-- =============================================
-- PROVIDER PAYOUTS TABLE
-- Providers declare payments, gérant validates
-- =============================================

CREATE TABLE IF NOT EXISTS provider_payouts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  provider_id uuid NOT NULL REFERENCES profiles(id),
  declared_by uuid NOT NULL REFERENCES profiles(id),
  amount numeric(10,2) NOT NULL,
  currency text DEFAULT 'EUR',
  period_from date NOT NULL,
  period_to date NOT NULL,
  payment_method text,
  reference text,
  proof_url text,
  status text DEFAULT 'pending',
  validated_by uuid REFERENCES profiles(id),
  validated_at timestamptz,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_provider_payouts_provider ON provider_payouts(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_payouts_status ON provider_payouts(status);

ALTER TABLE provider_payouts ENABLE ROW LEVEL SECURITY;

-- Gérant : tout voir et valider
CREATE POLICY pp_gerant ON provider_payouts FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

-- Provider : voir les siens
CREATE POLICY pp_provider_read ON provider_payouts FOR SELECT USING (
  declared_by = auth.uid()
);

-- Provider : créer les siens
CREATE POLICY pp_provider_insert ON provider_payouts FOR INSERT WITH CHECK (
  declared_by = auth.uid()
);
