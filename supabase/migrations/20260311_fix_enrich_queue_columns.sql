-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: Ajouter les colonnes manquantes à spender_enrich_queue
-- La table existait déjà sans tg_chat_id (CREATE TABLE IF NOT EXISTS a sauté)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE spender_enrich_queue ADD COLUMN IF NOT EXISTS tg_chat_id text;
ALTER TABLE spender_enrich_queue ADD COLUMN IF NOT EXISTS spender_id uuid;
ALTER TABLE spender_enrich_queue ADD COLUMN IF NOT EXISTS status text DEFAULT 'queued';
ALTER TABLE spender_enrich_queue ADD COLUMN IF NOT EXISTS attempts int DEFAULT 0;
ALTER TABLE spender_enrich_queue ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE spender_enrich_queue ADD COLUMN IF NOT EXISTS locked_by text;
ALTER TABLE spender_enrich_queue ADD COLUMN IF NOT EXISTS last_message_id text;
ALTER TABLE spender_enrich_queue ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE spender_enrich_queue ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Backfill tg_chat_id depuis tg_conversations pour les rows existantes
UPDATE spender_enrich_queue q
SET tg_chat_id = c.tg_chat_id
FROM tg_conversations c
WHERE q.conversation_id = c.id
  AND (q.tg_chat_id IS NULL OR q.tg_chat_id = '');

-- Vérification
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'spender_enrich_queue'
ORDER BY ordinal_position;
