-- ═══════════════════════════════════════════════════════════════════════════════
-- feat/messaging-permissions-rls-hardening
-- Durcissement RLS messagerie avec support profiles.messaging_permissions
-- Date: 2026-02-29
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- OBJECTIF:
--   Restreindre la visibilité chatter selon can_view_all_assigned.
--   Fallback deny-by-default si clé permission absente.
--   Gérant conserve full access (inchangé).
--
-- RÈGLE can_view_all_assigned:
--   - true: chatter voit assigned_chatter_id = moi OU model_id IN assigned_models
--   - false ou absent: chatter voit seulement assigned_chatter_id = moi
--
-- PRÉREQUIS:
--   - profiles.messaging_permissions (jsonb) existe (migration 20260228)
--   - Policies 20260227 déjà appliquées
--
-- ROLLOUT: exécuter puis tester par rôle (voir plan fin fichier)
-- ROLLBACK: voir fin du fichier
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 1: tg_conversations — Remplacer policy chatter SELECT
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tg_conv_chatter_select ON tg_conversations;

-- Chatter: SELECT avec messaging_permissions.can_view_all_assigned
-- can_view_all_assigned = true (explicite): assigned OU model dans assigned_models
-- can_view_all_assigned = false ou absent: assigned uniquement (deny-by-default)
CREATE POLICY tg_conv_chatter_select ON tg_conversations
  FOR SELECT
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'chatter'
    AND (
      assigned_chatter_id = auth.uid()
      OR (
        COALESCE(
          (SELECT (p.messaging_permissions->>'can_view_all_assigned')::boolean
           FROM profiles p WHERE p.id = auth.uid()),
          false
        ) = true
        AND model_id IN (
          SELECT (elem)::uuid
          FROM profiles p2,
               jsonb_array_elements_text(COALESCE(p2.assigned_models, '[]'::jsonb)) AS elem
          WHERE p2.id = auth.uid()
        )
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 2: tg_messages — Remplacer policy chatter SELECT
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tg_msg_chatter_select ON tg_messages;

-- Chatter: SELECT sur messages des conversations autorisées (même logique visibilité)
CREATE POLICY tg_msg_chatter_select ON tg_messages
  FOR SELECT
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'chatter'
    AND conversation_id IN (
      SELECT c.id FROM tg_conversations c
      WHERE c.assigned_chatter_id = auth.uid()
         OR (
           COALESCE(
             (SELECT (p.messaging_permissions->>'can_view_all_assigned')::boolean
              FROM profiles p WHERE p.id = auth.uid()),
             false
           ) = true
           AND c.model_id IN (
             SELECT (elem)::uuid
             FROM profiles p2,
                  jsonb_array_elements_text(COALESCE(p2.assigned_models, '[]'::jsonb)) AS elem
             WHERE p2.id = auth.uid()
           )
         )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 3: audit_logs — Remplacer policy chatter SELECT
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS audit_chatter_select ON audit_logs;

-- Chatter: SELECT avec même logique visibilité (target_type tg_conversation)
CREATE POLICY audit_chatter_select ON audit_logs
  FOR SELECT
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'chatter'
    AND target_type = 'tg_conversation'
    AND target_id IN (
      SELECT c.id FROM tg_conversations c
      WHERE c.assigned_chatter_id = auth.uid()
         OR (
           COALESCE(
             (SELECT (p.messaging_permissions->>'can_view_all_assigned')::boolean
              FROM profiles p WHERE p.id = auth.uid()),
             false
           ) = true
           AND c.model_id IN (
             SELECT (elem)::uuid
             FROM profiles p2,
                  jsonb_array_elements_text(COALESCE(p2.assigned_models, '[]'::jsonb)) AS elem
             WHERE p2.id = auth.uid()
           )
         )
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (exécuter manuellement si nécessaire)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Restaurer les policies originales (sans messaging_permissions):
--
-- DROP POLICY IF EXISTS tg_conv_chatter_select ON tg_conversations;
-- CREATE POLICY tg_conv_chatter_select ON tg_conversations FOR SELECT
--   USING (
--     (SELECT role FROM profiles WHERE id = auth.uid()) = 'chatter'
--     AND (
--       assigned_chatter_id = auth.uid()
--       OR model_id IN (
--         SELECT (elem)::uuid
--         FROM profiles p, jsonb_array_elements_text(COALESCE(p.assigned_models, '[]'::jsonb)) AS elem
--         WHERE p.id = auth.uid()
--       )
--     )
--   );
--
-- DROP POLICY IF EXISTS tg_msg_chatter_select ON tg_messages;
-- CREATE POLICY tg_msg_chatter_select ON tg_messages FOR SELECT
--   USING (
--     (SELECT role FROM profiles WHERE id = auth.uid()) = 'chatter'
--     AND conversation_id IN (
--       SELECT c.id FROM tg_conversations c
--       WHERE c.assigned_chatter_id = auth.uid()
--          OR c.model_id IN (
--            SELECT (elem)::uuid
--            FROM profiles p, jsonb_array_elements_text(COALESCE(p.assigned_models, '[]'::jsonb)) AS elem
--            WHERE p.id = auth.uid()
--          )
--     )
--   );
--
-- DROP POLICY IF EXISTS audit_chatter_select ON audit_logs;
-- CREATE POLICY audit_chatter_select ON audit_logs FOR SELECT
--   USING (
--     (SELECT role FROM profiles WHERE id = auth.uid()) = 'chatter'
--     AND target_type = 'tg_conversation'
--     AND target_id IN (
--       SELECT c.id FROM tg_conversations c
--       WHERE c.assigned_chatter_id = auth.uid()
--          OR c.model_id IN (
--            SELECT (elem)::uuid
--            FROM profiles p, jsonb_array_elements_text(COALESCE(p.assigned_models, '[]'::jsonb)) AS elem
--            WHERE p.id = auth.uid()
--          )
--     )
--   );
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- PLAN ROLLOUT
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 1. Vérifier que migration 20260228 (messaging_permissions) est appliquée
-- 2. Exécuter cette migration (supabase db push ou migration run)
-- 3. Tester bot-service (webhook, sendMessage) — doit rester OK (service role)
-- 4. Tester CRM: gerant (full), chatter can_view_all_assigned=true, chatter
--    can_view_all_assigned=false
-- 5. Si problème: exécuter rollback manuel
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- TESTS MANUELS PAR RÔLE
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 1. Gerant (auth.uid() = profil gerant):
--    - SELECT tg_conversations: toutes les lignes
--    - SELECT tg_messages: tous les messages
--    - SELECT audit_logs: tous les logs
--    - INSERT/UPDATE/DELETE: OK
--
-- 2. Chatter can_view_all_assigned = true (ou default):
--    - SELECT tg_conversations: assigned_chatter_id=uid OU model_id IN assigned_models
--    - SELECT tg_messages: messages des convs autorisées
--    - SELECT audit_logs: logs tg_conversation des convs autorisées
--
-- 3. Chatter can_view_all_assigned = false:
--    - SELECT tg_conversations: uniquement assigned_chatter_id = uid
--    - SELECT tg_messages: uniquement messages des convs assignées
--    - SELECT audit_logs: uniquement logs des convs assignées
--
-- 4. Chatter messaging_permissions absent (null):
--    - deny-by-default: COALESCE(..., false) = false
--    - comportement identique à can_view_all_assigned = false
--
-- 5. Provider / Modele: 0 lignes (deny)
--
-- 6. Service role: bypass RLS (bot-service OK)
--
-- ═══════════════════════════════════════════════════════════════════════════════
