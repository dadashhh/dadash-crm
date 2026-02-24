-- feat/telegram: Tables pour messagerie Telegram + audit
-- Idempotent: CREATE IF NOT EXISTS, pas de RLS dans cette étape

-- ═══════════════════════════════════════════════════════════════
-- tg_conversations
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tg_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_chat_id text UNIQUE NOT NULL,
  spender_id uuid NULL,
  model_id uuid NULL,
  assigned_chatter_id uuid NULL,
  status text NOT NULL DEFAULT 'open',
  last_message_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes tg_conversations
CREATE INDEX IF NOT EXISTS idx_tg_conversations_spender_id ON tg_conversations(spender_id) WHERE spender_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tg_conversations_model_id ON tg_conversations(model_id) WHERE model_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tg_conversations_assigned_chatter_id ON tg_conversations(assigned_chatter_id) WHERE assigned_chatter_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tg_conversations_status ON tg_conversations(status);
CREATE INDEX IF NOT EXISTS idx_tg_conversations_last_message_at ON tg_conversations(last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_tg_conversations_created_at ON tg_conversations(created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- tg_messages
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tg_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES tg_conversations(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  text text NULL,
  tg_message_id text NULL,
  sender_profile_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Indexes tg_messages
CREATE INDEX IF NOT EXISTS idx_tg_messages_conversation_id ON tg_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tg_messages_conversation_created ON tg_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_tg_messages_direction ON tg_messages(direction);
CREATE INDEX IF NOT EXISTS idx_tg_messages_tg_message_id ON tg_messages(tg_message_id) WHERE tg_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tg_messages_created_at ON tg_messages(created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- audit_logs
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NULL,
  action text NOT NULL,
  target_type text NULL,
  target_id uuid NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id) WHERE target_type IS NOT NULL AND target_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
