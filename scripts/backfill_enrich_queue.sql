-- ═══════════════════════════════════════════════════════════════════════════
-- BACKFILL: Enqueue toutes les conversations TG existantes pour enrichissement
-- Exécuter UNE FOIS après la migration 20260311_spender_enrich_queue.sql
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO spender_enrich_queue (conversation_id, tg_chat_id, spender_id, status)
SELECT
  c.id,
  c.tg_chat_id,
  c.spender_id,
  'queued'
FROM tg_conversations c
WHERE NOT EXISTS (
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
