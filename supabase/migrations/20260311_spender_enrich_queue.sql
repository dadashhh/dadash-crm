-- ═══════════════════════════════════════════════════════════════════════════
-- SPENDER ENRICH QUEUE — File d'attente pour enrichissement automatique
-- Date: 2026-03-11
-- Phase 3: Bot autofill + enrichissement profils spenders
--
-- Le worker Railway lock une row (queued→processing), charge les tg_messages,
-- extrait le profil, upsert spenders.meta.profile, écrit spender_events.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.spender_enrich_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES tg_conversations(id),
  tg_chat_id text NOT NULL,
  spender_id uuid,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'done', 'failed')),
  attempts int NOT NULL DEFAULT 0,
  locked_at timestamptz,
  locked_by text,
  last_message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enrich_queue_status ON spender_enrich_queue(status) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_enrich_queue_conversation ON spender_enrich_queue(conversation_id);
CREATE INDEX IF NOT EXISTS idx_enrich_queue_created ON spender_enrich_queue(created_at DESC);

ALTER TABLE spender_enrich_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seq_gerant_all ON spender_enrich_queue;
CREATE POLICY seq_gerant_all ON spender_enrich_queue FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

-- ─────────────────────────────────────────────────────────────────────────
-- Trigger: auto-enqueue quand une nouvelle tg_conversation est créée
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_auto_enqueue_enrich()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO spender_enrich_queue (conversation_id, tg_chat_id, spender_id)
  VALUES (NEW.id, NEW.tg_chat_id, NEW.spender_id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_enqueue_enrich ON tg_conversations;
CREATE TRIGGER trg_auto_enqueue_enrich
  AFTER INSERT ON tg_conversations
  FOR EACH ROW EXECUTE FUNCTION fn_auto_enqueue_enrich();

-- ─────────────────────────────────────────────────────────────────────────
-- Trigger: re-enqueue quand un nouveau message arrive (update queue)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_requeue_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv record;
BEGIN
  SELECT id, tg_chat_id, spender_id INTO v_conv FROM tg_conversations WHERE id = NEW.conversation_id;
  IF v_conv IS NULL THEN RETURN NEW; END IF;

  INSERT INTO spender_enrich_queue (conversation_id, tg_chat_id, spender_id, status)
  VALUES (v_conv.id, v_conv.tg_chat_id, v_conv.spender_id, 'queued')
  ON CONFLICT (conversation_id)
    WHERE status IN ('done', 'failed')
  DO UPDATE SET status = 'queued', attempts = 0, last_error = NULL, updated_at = now();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_requeue_on_message ON tg_messages;
CREATE TRIGGER trg_requeue_on_message
  AFTER INSERT ON tg_messages
  FOR EACH ROW EXECUTE FUNCTION fn_requeue_on_message();

-- ─────────────────────────────────────────────────────────────────────────
-- Unique constraint pour l'ON CONFLICT dans le trigger re-enqueue
-- ─────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE spender_enrich_queue ADD CONSTRAINT uq_enrich_queue_conversation UNIQUE (conversation_id);
EXCEPTION WHEN duplicate_table THEN NULL;
WHEN duplicate_object THEN NULL;
END $$;
