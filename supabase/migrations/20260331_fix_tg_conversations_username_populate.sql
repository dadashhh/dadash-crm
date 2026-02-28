-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX: upsert_tg_conversation now populates username, tg_user_id, display_name
-- Root cause: tg_conversations.username was always NULL, so backfill scripts
-- could never match manual spenders by username in conversations.
-- Date: 2026-03-31
-- ═══════════════════════════════════════════════════════════════════════════════

-- Upgrade upsert_tg_conversation to accept optional username/tg_user_id/display_name
CREATE OR REPLACE FUNCTION upsert_tg_conversation(
  p_tg_chat_id    TEXT,
  p_username       TEXT DEFAULT NULL,
  p_tg_user_id    TEXT DEFAULT NULL,
  p_display_name   TEXT DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_chat_id TEXT;
  v_id uuid;
BEGIN
  v_chat_id := nullif(trim(p_tg_chat_id), '');
  IF v_chat_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO tg_conversations (tg_chat_id, last_message_at)
  VALUES (v_chat_id, now())
  ON CONFLICT (tg_chat_id) DO UPDATE
    SET last_message_at = now()
  RETURNING id INTO v_id;

  -- Populate metadata columns (never overwrite with NULL)
  UPDATE tg_conversations SET
    username     = COALESCE(NULLIF(TRIM(p_username), ''), username),
    tg_user_id   = COALESCE(NULLIF(TRIM(p_tg_user_id), ''), tg_user_id::text)::bigint,
    display_name = COALESCE(NULLIF(TRIM(p_display_name), ''), display_name)
  WHERE id = v_id
    AND (
      (p_username IS NOT NULL AND TRIM(p_username) <> '' AND (username IS NULL OR username = ''))
      OR (p_tg_user_id IS NOT NULL AND TRIM(p_tg_user_id) <> '' AND tg_user_id IS NULL)
      OR (p_display_name IS NOT NULL AND TRIM(p_display_name) <> '' AND (display_name IS NULL OR display_name = ''))
    );

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_tg_conversation(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_tg_conversation(TEXT, TEXT, TEXT, TEXT) TO service_role;

-- Backfill: populate tg_conversations.username from tg_messages.meta for existing rows
UPDATE tg_conversations c SET
  username = sub.username,
  tg_user_id = CASE
    WHEN sub.tg_user_id ~ '^\d+$' THEN sub.tg_user_id::bigint
    ELSE c.tg_user_id
  END,
  display_name = COALESCE(c.display_name, sub.display_name)
FROM (
  SELECT DISTINCT ON (m.conversation_id)
    m.conversation_id,
    NULLIF(TRIM(m.meta->>'username'), '') AS username,
    NULLIF(TRIM(m.meta->>'tg_user_id'), '') AS tg_user_id,
    NULLIF(TRIM(m.meta->>'display_name'), '') AS display_name
  FROM tg_messages m
  WHERE m.direction = 'in'
    AND m.meta->>'username' IS NOT NULL
    AND TRIM(m.meta->>'username') <> ''
  ORDER BY m.conversation_id, m.created_at ASC
) sub
WHERE c.id = sub.conversation_id
  AND (c.username IS NULL OR c.username = '');
