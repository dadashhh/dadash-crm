-- =============================================
-- PHASE 6: Invoicing System
-- =============================================

-- Factures
CREATE TABLE IF NOT EXISTS invoices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),

  -- Numérotation séquentielle
  invoice_number text NOT NULL UNIQUE,  -- "DADASH-2026-0001"

  -- Type de facture
  type text NOT NULL,  -- 'outgoing_chatter', 'outgoing_model', 'incoming_provider'

  -- Parties
  from_name text NOT NULL,
  from_details jsonb,
  to_name text NOT NULL,
  to_details jsonb,

  -- Montants
  subtotal numeric(10,2) NOT NULL,
  tax_rate numeric(5,2) DEFAULT 0,
  tax_amount numeric(10,2) DEFAULT 0,
  total numeric(10,2) NOT NULL,
  currency text DEFAULT 'EUR',

  -- Lignes de détail
  line_items jsonb NOT NULL,

  -- Période couverte
  period_from date,
  period_to date,

  -- Paiement
  payment_method text,
  payment_reference text,
  payment_date date,
  due_date date,

  -- Statut
  status text DEFAULT 'draft',  -- 'draft', 'sent', 'paid', 'overdue', 'cancelled'

  -- Références
  payout_id uuid,
  profile_id uuid REFERENCES profiles(id),
  provider_id uuid,

  -- PDF
  pdf_url text,

  -- Metadata
  notes text,
  created_by uuid REFERENCES profiles(id),
  sent_at timestamptz,
  sent_to_email text
);

-- Compteur séquentiel pour numérotation
CREATE TABLE IF NOT EXISTS invoice_counter (
  id integer PRIMARY KEY DEFAULT 1,
  year integer NOT NULL,
  last_number integer DEFAULT 0,
  UNIQUE(id)
);

-- Initialiser le compteur
INSERT INTO invoice_counter (id, year, last_number) VALUES (1, 2026, 0)
ON CONFLICT (id) DO NOTHING;

-- Index
CREATE INDEX IF NOT EXISTS idx_invoices_type ON invoices(type);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_profile ON invoices(profile_id);
CREATE INDEX IF NOT EXISTS idx_invoices_provider ON invoices(provider_id);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at DESC);

-- RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_counter ENABLE ROW LEVEL SECURITY;

-- Gérant : tout voir
CREATE POLICY invoices_gerant ON invoices FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

-- Chatter/Modèle : voir ses propres factures
CREATE POLICY invoices_own ON invoices FOR SELECT USING (
  profile_id = auth.uid()
);

-- Provider : voir ses propres factures
CREATE POLICY invoices_provider_read ON invoices FOR SELECT USING (
  provider_id IN (
    SELECT p.id FROM providers p
    JOIN profiles pr ON pr.id = auth.uid()
    WHERE pr.role = 'provider'
  )
);

-- Counter : gérant only
CREATE POLICY counter_gerant ON invoice_counter FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);
