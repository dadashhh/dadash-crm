CREATE TABLE IF NOT EXISTS public.scheduled_broadcasts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES auth.users(id),
  model_id      TEXT,
  audience_id   TEXT,
  chat_ids      TEXT[] NOT NULL,
  message       TEXT NOT NULL,
  scheduled_at  TIMESTAMPTZ NOT NULL,
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','cancelled')),
  sent_count    INT DEFAULT 0,
  failed_count  INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  sent_at       TIMESTAMPTZ,
  metadata      JSONB
);

CREATE INDEX IF NOT EXISTS idx_sb_status       ON public.scheduled_broadcasts(status);
CREATE INDEX IF NOT EXISTS idx_sb_scheduled_at ON public.scheduled_broadcasts(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_sb_model        ON public.scheduled_broadcasts(model_id);
CREATE INDEX IF NOT EXISTS idx_sb_user         ON public.scheduled_broadcasts(user_id);

ALTER TABLE public.scheduled_broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY sb_select ON public.scheduled_broadcasts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY sb_insert ON public.scheduled_broadcasts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY sb_update ON public.scheduled_broadcasts FOR UPDATE USING (auth.uid() = user_id);
