-- ═══════════════════════════════════════════════════════════════
-- PUSH MODULE — push_recipients + push_campaigns enrichment
-- Date: 2026-03-06
-- ═══════════════════════════════════════════════════════════════
-- Ajoute les colonnes manquantes à push_campaigns,
-- crée push_recipients avec RLS propre.
-- Safe: IF NOT EXISTS + DROP POLICY IF EXISTS
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Enrichir push_campaigns avec les colonnes de tracking ──

ALTER TABLE push_campaigns
  ADD COLUMN IF NOT EXISTS total_targets integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_count    integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_log     jsonb   DEFAULT '[]'::jsonb;

-- ── 2. Table push_recipients ──────────────────────────────────

CREATE TABLE IF NOT EXISTS push_recipients (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid        NOT NULL REFERENCES push_campaigns(id) ON DELETE CASCADE,
  spender_id  uuid        NOT NULL REFERENCES spenders(id),
  tg_user_id  text        NOT NULL,
  status      text        NOT NULL DEFAULT 'pending', -- 'pending' | 'sent' | 'failed'
  error       text,
  sent_at     timestamptz,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_recipients_campaign ON push_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_push_recipients_status   ON push_recipients(status);
CREATE INDEX IF NOT EXISTS idx_push_recipients_spender  ON push_recipients(spender_id);

-- ── 3. RLS ────────────────────────────────────────────────────

ALTER TABLE push_recipients ENABLE ROW LEVEL SECURITY;

-- Drop old policies cleanly
DROP POLICY IF EXISTS push_recipients_gerant        ON push_recipients;
DROP POLICY IF EXISTS push_recipients_model_read    ON push_recipients;

-- Gérant : accès total
CREATE POLICY push_recipients_gerant ON push_recipients
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
  );

-- Modèle : lecture uniquement sur ses propres campagnes
CREATE POLICY push_recipients_model_read ON push_recipients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM push_campaigns pc
      WHERE pc.id = push_recipients.campaign_id
        AND (
          pc.model_id = auth.uid()
          OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
        )
    )
  );

-- ── 4. RLS sur push_campaigns (sécurité complète) ─────────────

ALTER TABLE push_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_campaigns_gerant      ON push_campaigns;
DROP POLICY IF EXISTS push_campaigns_model_read  ON push_campaigns;
DROP POLICY IF EXISTS push_campaigns_model_insert ON push_campaigns;

-- Gérant : accès total
CREATE POLICY push_campaigns_gerant ON push_campaigns
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
  );

-- Modèle : lecture de ses propres campagnes
CREATE POLICY push_campaigns_model_read ON push_campaigns
  FOR SELECT USING (
    model_id = auth.uid()
    OR created_by = auth.uid()
  );

-- Modèle : insert (le model_id doit correspondre à son uid ou à un modèle qu'il gère)
CREATE POLICY push_campaigns_model_insert ON push_campaigns
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
  );
