-- Migration: Add proof_url to transactions + tx-proofs storage bucket
-- Dependency: Run BEFORE Alfred PR1 and PR2

-- 1. Add proof_url column on transactions
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS proof_url TEXT;

-- 2. Create tx-proofs bucket (PUBLIC, like all other project buckets)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tx-proofs',
  'tx-proofs',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 3. Policy: Only gérant can upload proofs
CREATE POLICY "Gérant upload preuves TX"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tx-proofs'
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'gerant'
);

-- 4. Policy: All authenticated users can read proofs
CREATE POLICY "Lecture preuves TX authentifié"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'tx-proofs');
