-- feat/compta: Paies modèles dans même table que chatters
-- type: 'chatter' | 'modele'
-- user_id: pour chatters (profile id)
-- model_id: pour modèles (model id)
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS type text DEFAULT 'chatter' CHECK (type IN ('chatter', 'modele'));
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS model_id uuid REFERENCES models(id);
