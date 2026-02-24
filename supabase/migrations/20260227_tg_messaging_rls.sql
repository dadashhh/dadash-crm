-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS progressif: tg_conversations, tg_messages, audit_logs
-- Branche: feat/tg-messaging-rls
-- Date: 2026-02-27
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- RÈGLES:
--   gerant: full access (SELECT, INSERT, UPDATE, DELETE)
--   chatter: SELECT limité à ses conversations autorisées
--            jamais DELETE messages/conversations
--            pas UPDATE conversations (MVP deny)
--   inserts messages: via service role (bot-service) uniquement, pas direct chatter
--   audit_logs: insert via service role + gérant si nécessaire
--
-- HYPOTHÈSES:
--   - profiles.role (gerant, chatter, provider, modele)
--   - profiles.id = auth.uid() (lien auth.users ↔ profiles)
--   - profiles.assigned_models (jsonb array de uuid) — FALLBACK: si type différent, deny
--
-- ROLLOUT PLAN:
--   Phase 1: Exécuter cette migration (SELECT + writes restrictifs en une fois)
--   Phase 2: Vérifier bot-service (webhook, sendMessage) avec service role — doit rester OK
--   Phase 3: Tester CRM avec gerant puis chatter
-- ROLLBACK: voir fin du fichier
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 1: tg_conversations — ENABLE RLS + SELECT
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE tg_conversations ENABLE ROW LEVEL SECURITY;

-- Gerant: accès complet
CREATE POLICY tg_conv_gerant_all ON tg_conversations
  FOR ALL
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant');

-- Chatter: SELECT uniquement sur conversations autorisées
-- Autorisé si: assigned_chatter_id = moi OU model_id dans mes assigned_models
-- HYPOTHÈSE: profiles.assigned_models est jsonb array. Si uuid[], adapter la sous-requête.
CREATE POLICY tg_conv_chatter_select ON tg_conversations
  FOR SELECT
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'chatter'
    AND (
      assigned_chatter_id = auth.uid()
      OR model_id IN (
        SELECT (elem)::uuid
        FROM profiles p,
        jsonb_array_elements_text(COALESCE(p.assigned_models, '[]'::jsonb)) AS elem
        WHERE p.id = auth.uid()
      )
    )
  );

-- Chatter: pas d'UPDATE (MVP deny)
-- Chatter: pas d'INSERT (conversations créées par bot/webhook)
-- Chatter: pas de DELETE
-- → Pas de policy = deny par défaut

-- Service role: bypass RLS automatiquement (Supabase service key)
-- Anon non authentifié: deny (auth.uid() = null)
-- Provider/modele: aucune policy = deny

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 1: tg_messages — ENABLE RLS + SELECT
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE tg_messages ENABLE ROW LEVEL SECURITY;

-- Gerant: accès complet
CREATE POLICY tg_msg_gerant_all ON tg_messages
  FOR ALL
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant');

-- Chatter: SELECT uniquement sur messages des conversations autorisées
-- (conversation doit être dans tg_conversations visible par le chatter)
CREATE POLICY tg_msg_chatter_select ON tg_messages
  FOR SELECT
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'chatter'
    AND conversation_id IN (
      SELECT c.id FROM tg_conversations c
      WHERE c.assigned_chatter_id = auth.uid()
         OR c.model_id IN (
           SELECT (elem)::uuid
           FROM profiles p,
           jsonb_array_elements_text(COALESCE(p.assigned_models, '[]'::jsonb)) AS elem
           WHERE p.id = auth.uid()
         )
    )
  );

-- Chatter: pas d'INSERT (messages insérés par bot-service via service role)
-- Chatter: pas d'UPDATE
-- Chatter: pas de DELETE
-- → deny par défaut

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 1: audit_logs — ENABLE RLS + SELECT
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Gerant: accès complet (SELECT + INSERT si besoin depuis CRM)
CREATE POLICY audit_gerant_all ON audit_logs
  FOR ALL
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant');

-- Chatter: SELECT limité aux logs tg_conversation des conversations autorisées
-- (uniquement target_type = 'tg_conversation' et target_id dans ses convs)
CREATE POLICY audit_chatter_select ON audit_logs
  FOR SELECT
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'chatter'
    AND target_type = 'tg_conversation'
    AND target_id IN (
      SELECT c.id FROM tg_conversations c
      WHERE c.assigned_chatter_id = auth.uid()
         OR c.model_id IN (
           SELECT (elem)::uuid
           FROM profiles p,
           jsonb_array_elements_text(COALESCE(p.assigned_models, '[]'::jsonb)) AS elem
           WHERE p.id = auth.uid()
         )
    )
  );

-- Chatter: pas d'INSERT (audit inséré par bot-service + gérant)
-- → deny par défaut

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK PLAN
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pour désactiver RLS et revenir à l'état précédent:
--
--   -- tg_conversations
--   DROP POLICY IF EXISTS tg_conv_gerant_all ON tg_conversations;
--   DROP POLICY IF EXISTS tg_conv_chatter_select ON tg_conversations;
--   ALTER TABLE tg_conversations DISABLE ROW LEVEL SECURITY;
--
--   -- tg_messages
--   DROP POLICY IF EXISTS tg_msg_gerant_all ON tg_messages;
--   DROP POLICY IF EXISTS tg_msg_chatter_select ON tg_messages;
--   ALTER TABLE tg_messages DISABLE ROW LEVEL SECURITY;
--
--   -- audit_logs
--   DROP POLICY IF EXISTS audit_gerant_all ON audit_logs;
--   DROP POLICY IF EXISTS audit_chatter_select ON audit_logs;
--   ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- TESTS MANUELS PAR RÔLE
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 1. Gerant (auth.uid() = profil gerant):
--    - SELECT tg_conversations: doit voir toutes les lignes
--    - SELECT tg_messages: doit voir tous les messages
--    - SELECT audit_logs: doit voir tous les logs
--    - INSERT/UPDATE/DELETE: doit fonctionner
--
-- 2. Chatter (auth.uid() = profil chatter avec assigned_models):
--    - SELECT tg_conversations: uniquement assigned_chatter_id=uid OU model_id IN assigned_models
--    - SELECT tg_messages: uniquement des conversations autorisées
--    - SELECT audit_logs: uniquement target_type='tg_conversation' ET target_id dans convs autorisées
--    - INSERT tg_messages: doit échouer (403)
--    - DELETE: doit échouer (403)
--
-- 3. Provider / Modele:
--    - SELECT tg_*: doit retourner 0 lignes (deny)
--
-- 4. Service role (SUPABASE_SERVICE_KEY):
--    - Bypass RLS: tous les accès autorisés (bot-service, webhook, sendMessage)
--
-- ═══════════════════════════════════════════════════════════════════════════════
