-- ═══════════════════════════════════════════════════════════════════════════
-- BACKFILL: Enqueue toutes les conversations TG existantes pour enrichissement
-- Exécuter UNE FOIS après la migration 20260311_spender_enrich_queue.sql
-- NOTE: colonne = tg_user_id (schéma prod), valeur = tg_conversations.tg_chat_id
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO spender_enrich_queue (conversation_id, tg_user_id, spender_id, status)
SELECT
  c.id,
  c.tg_chat_id,
  c.spender_id,
  'queued'
FROM tg_conversations c
WHERE c.tg_chat_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM spender_enrich_queue q WHERE q.conversation_id = c.id
  )
ORDER BY c.created_at ASC;

-- Vérification
SELECT
  status,
  COUNT(*) AS cnt
FROM spender_enrich_queue
GROUP BY status
ORDER BY status;
