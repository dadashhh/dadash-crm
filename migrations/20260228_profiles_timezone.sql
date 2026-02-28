-- Add timezone to profiles for viewer-specific date display
-- Used by formatTxDateTime: user.timezone > chatter.timezone > provider.timezone > UTC
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'UTC';
