-- =============================================
-- PHASE 5: WhatsApp Analyzer Logs
-- =============================================

CREATE TABLE IF NOT EXISTS wa_analysis_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  analyzed_by uuid REFERENCES profiles(id),
  filename text,
  contact_phone text,
  contact_name text,
  total_messages integer,
  analysis_result jsonb,
  tg_match_id uuid,
  tg_match_score integer DEFAULT 0,
  imported boolean DEFAULT false,
  spender_id uuid
);

-- Index
CREATE INDEX IF NOT EXISTS idx_wa_analysis_logs_analyzed_by ON wa_analysis_logs(analyzed_by);
CREATE INDEX IF NOT EXISTS idx_wa_analysis_logs_imported ON wa_analysis_logs(imported);

-- RLS
ALTER TABLE wa_analysis_logs ENABLE ROW LEVEL SECURITY;

-- gérant: all
CREATE POLICY wa_analysis_logs_gerant ON wa_analysis_logs FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

-- chatter: read/insert own
CREATE POLICY wa_analysis_logs_chatter_read ON wa_analysis_logs FOR SELECT USING (
  analyzed_by = auth.uid()
);
CREATE POLICY wa_analysis_logs_chatter_insert ON wa_analysis_logs FOR INSERT WITH CHECK (
  analyzed_by = auth.uid()
);
