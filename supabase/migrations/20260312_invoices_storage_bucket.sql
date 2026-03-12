-- Migration: Create storage bucket "invoices" for provider PDF invoices
-- Bucket is public so invoice_url links work without auth tokens

INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow authenticated users to upload to invoices bucket
DROP POLICY IF EXISTS "invoices_upload" ON storage.objects;
CREATE POLICY "invoices_upload" ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'invoices'
  AND auth.role() = 'authenticated'
);

-- Allow public read access (bucket is public)
DROP POLICY IF EXISTS "invoices_public_read" ON storage.objects;
CREATE POLICY "invoices_public_read" ON storage.objects FOR SELECT
USING (bucket_id = 'invoices');

-- Allow owners and gerants to update/delete
DROP POLICY IF EXISTS "invoices_manage" ON storage.objects;
CREATE POLICY "invoices_manage" ON storage.objects FOR UPDATE
USING (
  bucket_id = 'invoices'
  AND auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "invoices_delete" ON storage.objects;
CREATE POLICY "invoices_delete" ON storage.objects FOR DELETE
USING (
  bucket_id = 'invoices'
  AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);
