-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: Ajouter les colonnes manquantes à spender_enrich_queue
-- Le schéma prod utilise tg_user_id (pas tg_chat_id)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE spender_enrich_queue ADD COLUMN IF NOT EXISTS tg_user_id bigint;
ALTER TABLE spender_enrich_queue ADD COLUMN IF NOT EXISTS spender_id uuid;
ALTER TABLE spender_enrich_queue ADD COLUMN IF NOT EXISTS status text DEFAULT 'queued';
ALTER TABLE spender_enrich_queue ADD COLUMN IF NOT EXISTS attempts int DEFAULT 0;
ALTER TABLE spender_enrich_queue ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE spender_enrich_queue ADD COLUMN IF NOT EXISTS locked_by text;
ALTER TABLE spender_enrich_queue ADD COLUMN IF NOT EXISTS last_message_id text;
ALTER TABLE spender_enrich_queue ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE spender_enrich_queue ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Backfill tg_user_id depuis tg_conversations pour les rows existantes
UPDATE spender_enrich_queue q
SET tg_user_id = c.tg_chat_id::bigint
FROM tg_conversations c
WHERE q.conversation_id = c.id
  AND q.tg_user_id IS NULL
  AND c.tg_chat_id IS NOT NULL
  AND c.tg_chat_id ~ '^\d+$';
