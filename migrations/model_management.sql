-- =============================================
-- PHASE 3: Model Management (Tasks, Content, Checklists)
-- =============================================

-- Tâches assignées aux modèles
CREATE TABLE IF NOT EXISTS model_tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  model_id uuid NOT NULL REFERENCES profiles(id),
  assigned_by uuid REFERENCES profiles(id),
  title text NOT NULL,
  description text,
  category text DEFAULT 'general',
  priority text DEFAULT 'medium',
  status text DEFAULT 'todo',
  due_date date,
  completed_at timestamptz,
  notes text
);

-- Contenu à produire (status flow riche)
CREATE TABLE IF NOT EXISTS content_list (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  model_id uuid NOT NULL REFERENCES profiles(id),
  assigned_by uuid REFERENCES profiles(id),
  title text NOT NULL,
  description text,
  content_type text DEFAULT 'photo',
  platform text,
  status text DEFAULT 'pending',
  due_date date,
  bonus_amount numeric(10,2) DEFAULT 0,
  bonus_currency text DEFAULT 'EUR',
  completed_at timestamptz,
  notes text
);

-- Templates de checklists récurrentes
CREATE TABLE IF NOT EXISTS checklist_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  name text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]',
  active boolean DEFAULT true
);

-- Instances quotidiennes par modèle
CREATE TABLE IF NOT EXISTS checklist_instances (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  model_id uuid NOT NULL REFERENCES profiles(id),
  template_id uuid NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  items jsonb NOT NULL DEFAULT '[]',
  UNIQUE(model_id, template_id, date)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_model_tasks_model ON model_tasks(model_id);
CREATE INDEX IF NOT EXISTS idx_model_tasks_status ON model_tasks(status);
CREATE INDEX IF NOT EXISTS idx_content_list_model ON content_list(model_id);
CREATE INDEX IF NOT EXISTS idx_content_list_status ON content_list(status);
CREATE INDEX IF NOT EXISTS idx_checklist_instances_model ON checklist_instances(model_id);
CREATE INDEX IF NOT EXISTS idx_checklist_instances_date ON checklist_instances(date);

-- RLS
ALTER TABLE model_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_instances ENABLE ROW LEVEL SECURITY;

-- model_tasks: gérant all, modèle read+update own
CREATE POLICY model_tasks_gerant ON model_tasks FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);
CREATE POLICY model_tasks_model_read ON model_tasks FOR SELECT USING (
  model_id = auth.uid()
);
CREATE POLICY model_tasks_model_update ON model_tasks FOR UPDATE USING (
  model_id = auth.uid()
) WITH CHECK (model_id = auth.uid());

-- content_list: gérant all, modèle read+update own
CREATE POLICY content_list_gerant ON content_list FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);
CREATE POLICY content_list_model_read ON content_list FOR SELECT USING (
  model_id = auth.uid()
);
CREATE POLICY content_list_model_update ON content_list FOR UPDATE USING (
  model_id = auth.uid()
) WITH CHECK (model_id = auth.uid());

-- checklist_templates: gérant all, everyone read
CREATE POLICY checklist_templates_read ON checklist_templates FOR SELECT USING (true);
CREATE POLICY checklist_templates_write ON checklist_templates FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

-- checklist_instances: gérant all, modèle read+update+insert own
CREATE POLICY checklist_instances_gerant ON checklist_instances FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);
CREATE POLICY checklist_instances_model_read ON checklist_instances FOR SELECT USING (
  model_id = auth.uid()
);
CREATE POLICY checklist_instances_model_update ON checklist_instances FOR UPDATE USING (
  model_id = auth.uid()
) WITH CHECK (model_id = auth.uid());
CREATE POLICY checklist_instances_model_insert ON checklist_instances FOR INSERT WITH CHECK (
  model_id = auth.uid()
);

-- =============================================
-- SEED: Template checklist quotidienne
-- =============================================
INSERT INTO checklist_templates (name, items) VALUES
('Routine Quotidienne', '[
  {"title": "Poster une story Instagram", "sort_order": 0},
  {"title": "Répondre aux DMs prioritaires", "sort_order": 1},
  {"title": "Publier 1 post feed", "sort_order": 2},
  {"title": "Vérifier les abonnements expirés", "sort_order": 3},
  {"title": "Préparer le contenu de demain", "sort_order": 4},
  {"title": "Envoyer les PPV du jour", "sort_order": 5},
  {"title": "Mettre à jour le planning", "sort_order": 6}
]');
