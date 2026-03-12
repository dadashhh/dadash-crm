-- Migration: Add billing fields for invoice generation on spenders table
-- billing_phone and billing_full_name are pre-filled from client info when generating a provider invoice

ALTER TABLE spenders
  ADD COLUMN IF NOT EXISTS billing_phone     text,
  ADD COLUMN IF NOT EXISTS billing_full_name text;

COMMENT ON COLUMN spenders.billing_phone     IS 'Téléphone client pour facturation (pré-rempli lors génération facture provider)';
COMMENT ON COLUMN spenders.billing_full_name IS 'Nom complet client pour facturation (pré-rempli lors génération facture provider)';
