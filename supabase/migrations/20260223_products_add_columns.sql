-- Hotfix: ajouter les colonnes manquantes à la table products
ALTER TABLE products ADD COLUMN IF NOT EXISTS duration_minutes integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS icon text;
