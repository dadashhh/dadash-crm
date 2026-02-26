-- Migration: add is_read column to alerts table
-- Allows users to mark alerts as read via checkbox without dismissing them

ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false NOT NULL;

-- Index for fast filtering of unread alerts
CREATE INDEX IF NOT EXISTS idx_alerts_is_read ON alerts(is_read);
