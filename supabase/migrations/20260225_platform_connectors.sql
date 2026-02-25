-- ============================================================
-- DADASH CRM — Platform Connectors (OnlyFans, MYM, Telegram)
-- ============================================================

-- 1. platform_accounts — credentials + status per model/platform
CREATE TABLE IF NOT EXISTS platform_accounts (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  platform             TEXT        NOT NULL CHECK (platform IN ('onlyfans','mym','telegram')),
  account_name         TEXT        NOT NULL,
  platform_account_id  TEXT,
  model_id             UUID        REFERENCES models(id) ON DELETE SET NULL,
  credentials          JSONB,                          -- encrypted at rest by Supabase
  status               TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','error','pending')),
  last_sync_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_accounts_platform   ON platform_accounts(platform);
CREATE INDEX IF NOT EXISTS idx_platform_accounts_model_id   ON platform_accounts(model_id);
CREATE INDEX IF NOT EXISTS idx_platform_accounts_status     ON platform_accounts(status);

-- 2. platform_fans — normalized fan/subscriber records
CREATE TABLE IF NOT EXISTS platform_fans (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_account_id  UUID        NOT NULL REFERENCES platform_accounts(id) ON DELETE CASCADE,
  platform             TEXT        NOT NULL,
  platform_fan_id      TEXT        NOT NULL,
  username             TEXT,
  display_name         TEXT,
  total_spent          DECIMAL(10,2) NOT NULL DEFAULT 0,
  subscription_status  TEXT,
  spender_id           UUID        REFERENCES spenders(id) ON DELETE SET NULL,
  synced_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(platform_account_id, platform_fan_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_fans_account   ON platform_fans(platform_account_id);
CREATE INDEX IF NOT EXISTS idx_platform_fans_spender   ON platform_fans(spender_id);
CREATE INDEX IF NOT EXISTS idx_platform_fans_platform  ON platform_fans(platform);

-- 3. sync_jobs — audit trail of each sync operation
CREATE TABLE IF NOT EXISTS sync_jobs (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_account_id  UUID        REFERENCES platform_accounts(id) ON DELETE CASCADE,
  job_type             TEXT        NOT NULL DEFAULT 'fans_sync',
  status               TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','error')),
  records_synced       INTEGER     NOT NULL DEFAULT 0,
  error_message        TEXT,
  started_at           TIMESTAMPTZ,
  finished_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_account ON sync_jobs(platform_account_id);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_status  ON sync_jobs(status);

-- 4. platform_links — generic entity matching between platforms and Dadash
CREATE TABLE IF NOT EXISTS platform_links (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  platform             TEXT        NOT NULL,
  platform_entity_type TEXT        NOT NULL DEFAULT 'fan',
  platform_entity_id   TEXT        NOT NULL,
  dadash_entity_type   TEXT        NOT NULL DEFAULT 'spender',
  dadash_entity_id     UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(platform, platform_entity_type, platform_entity_id)
);

-- ============================================================
-- RLS — Only authenticated gérant role can access these tables
-- ============================================================

ALTER TABLE platform_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_fans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_jobs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_links     ENABLE ROW LEVEL SECURITY;

-- Helper: check if the calling JWT belongs to a gérant profile
-- (profiles.role = 'gerant' for the authenticated user)
CREATE OR REPLACE FUNCTION is_gerant()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'gerant'
  );
$$;

-- platform_accounts
CREATE POLICY "gerant_select_platform_accounts" ON platform_accounts
  FOR SELECT USING (is_gerant());
CREATE POLICY "gerant_insert_platform_accounts" ON platform_accounts
  FOR INSERT WITH CHECK (is_gerant());
CREATE POLICY "gerant_update_platform_accounts" ON platform_accounts
  FOR UPDATE USING (is_gerant());
CREATE POLICY "gerant_delete_platform_accounts" ON platform_accounts
  FOR DELETE USING (is_gerant());

-- platform_fans
CREATE POLICY "gerant_select_platform_fans" ON platform_fans
  FOR SELECT USING (is_gerant());
CREATE POLICY "gerant_insert_platform_fans" ON platform_fans
  FOR INSERT WITH CHECK (is_gerant());
CREATE POLICY "gerant_update_platform_fans" ON platform_fans
  FOR UPDATE USING (is_gerant());
CREATE POLICY "gerant_delete_platform_fans" ON platform_fans
  FOR DELETE USING (is_gerant());

-- sync_jobs
CREATE POLICY "gerant_select_sync_jobs" ON sync_jobs
  FOR SELECT USING (is_gerant());
CREATE POLICY "gerant_insert_sync_jobs" ON sync_jobs
  FOR INSERT WITH CHECK (is_gerant());
CREATE POLICY "gerant_update_sync_jobs" ON sync_jobs
  FOR UPDATE USING (is_gerant());

-- platform_links
CREATE POLICY "gerant_select_platform_links" ON platform_links
  FOR SELECT USING (is_gerant());
CREATE POLICY "gerant_insert_platform_links" ON platform_links
  FOR INSERT WITH CHECK (is_gerant());
CREATE POLICY "gerant_update_platform_links" ON platform_links
  FOR UPDATE USING (is_gerant());
CREATE POLICY "gerant_delete_platform_links" ON platform_links
  FOR DELETE USING (is_gerant());

-- Updated_at auto-trigger for platform_accounts
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_platform_accounts_updated_at ON platform_accounts;
CREATE TRIGGER trg_platform_accounts_updated_at
  BEFORE UPDATE ON platform_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
