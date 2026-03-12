-- Migration: Add billing info columns to profiles table
-- These columns are used to pre-fill provider invoices (PDF)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS billing_company_name text,
  ADD COLUMN IF NOT EXISTS billing_address      text,
  ADD COLUMN IF NOT EXISTS billing_siret        text,
  ADD COLUMN IF NOT EXISTS billing_vat_number   text;

-- Only the profile owner can read/update their own billing info
-- (RLS policy assumes profiles table already has RLS enabled with auth.uid() = id)
COMMENT ON COLUMN profiles.billing_company_name IS 'Nom société pour facturation (ex: SARL Martin Consulting)';
COMMENT ON COLUMN profiles.billing_address      IS 'Adresse complète de facturation (rue, code postal, ville, pays)';
COMMENT ON COLUMN profiles.billing_siret        IS 'Numéro SIRET (ex: 123 456 789 00012)';
COMMENT ON COLUMN profiles.billing_vat_number   IS 'Numéro de TVA intracommunautaire (ex: FR12345678901)';
