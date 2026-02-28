-- ═══════════════════════════════════════════════════════════════════════
-- MIGRATION: notification_log — idempotency for bot→manager notifications
-- Date: 2026-02-28
-- Idempotent: IF NOT EXISTS
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.notification_log (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  idempotency_key text        NOT NULL,
  channel         text        NOT NULL DEFAULT 'telegram',
  status          text        NOT NULL DEFAULT 'sent',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_log_key
  ON public.notification_log(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_notification_log_created
  ON public.notification_log(created_at DESC);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

-- Only service_role writes; gérant can read for debugging
DROP POLICY IF EXISTS notif_log_gerant_read ON public.notification_log;
CREATE POLICY notif_log_gerant_read ON public.notification_log
  FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'gerant'
  );
