-- feat/telegram-rpc-upsert-conversation
-- RPC idempotente: créer ou récupérer une conversation Telegram
-- Pas de RLS dans cette étape

-- ═══════════════════════════════════════════════════════════════
-- upsert_tg_conversation(p_tg_chat_id text) → uuid
-- Crée ou récupère une conversation par tg_chat_id.
-- Met à jour last_message_at = now() si la conversation existe.
-- Retourne l'id de la conversation, ou NULL si input invalide.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION upsert_tg_conversation(p_tg_chat_id text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_chat_id text;
  v_id uuid;
BEGIN
  -- Sécuriser input: rejeter NULL ou chaîne vide/whitespace
  v_chat_id := nullif(trim(p_tg_chat_id), '');
  IF v_chat_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Upsert: INSERT si absent, sinon UPDATE last_message_at
  INSERT INTO tg_conversations (tg_chat_id, last_message_at)
  VALUES (v_chat_id, now())
  ON CONFLICT (tg_chat_id) DO UPDATE
    SET last_message_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
