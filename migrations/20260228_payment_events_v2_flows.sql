-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: Payment Events V2 — Flow A (salaire gérant→chatter)
--            + Flow B (déclaration provider→gérant)
-- Ajoute les colonnes manquantes à payment_events existante
-- Crée le bucket Supabase Storage "payment-proofs"
-- ═══════════════════════════════════════════════════════════════

-- ── Colonnes supplémentaires sur payment_events ──
ALTER TABLE public.payment_events
  ADD COLUMN IF NOT EXISTS method          text,           -- virement | crypto | cash | twint | revolut | paypal
  ADD COLUMN IF NOT EXISTS screenshot_url  text,           -- preuve paiement (gérant upload)
  ADD COLUMN IF NOT EXISTS receipt_url     text,           -- preuve réception (chatter/provider upload)
  ADD COLUMN IF NOT EXISTS invoice_url     text,           -- facture PDF générée
  ADD COLUMN IF NOT EXISTS invoice_number  text,           -- numéro facture auto-incrémenté
  ADD COLUMN IF NOT EXISTS confirmed_at    timestamptz,    -- quand le receveur a confirmé
  ADD COLUMN IF NOT EXISTS declared_at     timestamptz,    -- quand le provider a déclaré
  ADD COLUMN IF NOT EXISTS rejected_at     timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_reason text,
  ADD COLUMN IF NOT EXISTS validated_by    uuid REFERENCES public.profiles(id);

-- status étendu : pending | paid | confirmed | declared | validated | rejected | cancelled
-- (les anciens statuts pending/paid/cancelled restent valides)

-- ── Compteur factures ──
CREATE TABLE IF NOT EXISTS public.invoice_sequence (
  id      serial PRIMARY KEY,
  year    int NOT NULL DEFAULT EXTRACT(year FROM now())::int,
  seq     int NOT NULL DEFAULT 0,
  UNIQUE (year)
);

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  yr  int := EXTRACT(year FROM now())::int;
  seq int;
BEGIN
  INSERT INTO public.invoice_sequence (year, seq) VALUES (yr, 1)
  ON CONFLICT (year) DO UPDATE SET seq = invoice_sequence.seq + 1
  RETURNING invoice_sequence.seq INTO seq;
  RETURN 'INV-' || yr || '-' || LPAD(seq::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_invoice_number() TO authenticated, service_role;

-- ── RLS : permettre aux chatters/providers d'UPDATE leur propre payment_event
--    (pour confirmer réception : receipt_url, confirmed_at, status)
DROP POLICY IF EXISTS pe_confirm_receiver ON public.payment_events;
CREATE POLICY pe_confirm_receiver ON public.payment_events
  FOR UPDATE
  USING (to_user_id = auth.uid())
  WITH CHECK (to_user_id = auth.uid());

-- ── RLS : permettre aux providers/chatters d'INSERT une déclaration (Flow B)
DROP POLICY IF EXISTS pe_insert_receiver ON public.payment_events;
CREATE POLICY pe_insert_receiver ON public.payment_events
  FOR INSERT
  WITH CHECK (
    from_user_id = auth.uid()
    AND kind = 'declaration'
  );

-- ── Supabase Storage bucket "payment-proofs" (à exécuter dans le dashboard Storage)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('payment-proofs', 'payment-proofs', false)
-- ON CONFLICT (id) DO NOTHING;

-- ── Policies Storage ──
DROP POLICY IF EXISTS "payment-proofs upload" ON storage.objects;
CREATE POLICY "payment-proofs upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'payment-proofs'
    AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "payment-proofs read own" ON storage.objects;
CREATE POLICY "payment-proofs read own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'payment-proofs'
    AND (
      (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'gerant'
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "payment-proofs delete gerant" ON storage.objects;
CREATE POLICY "payment-proofs delete gerant" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'payment-proofs'
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'gerant'
  );
