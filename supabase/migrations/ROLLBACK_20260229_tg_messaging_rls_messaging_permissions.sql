-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 20260229_tg_messaging_rls_messaging_permissions.sql
-- Restaure les policies originales (sans messaging_permissions)
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS tg_conv_chatter_select ON tg_conversations;
CREATE POLICY tg_conv_chatter_select ON tg_conversations FOR SELECT
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'chatter'
    AND (
      assigned_chatter_id = auth.uid()
      OR model_id IN (
        SELECT (elem)::uuid
        FROM profiles p, jsonb_array_elements_text(COALESCE(p.assigned_models, '[]'::jsonb)) AS elem
        WHERE p.id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS tg_msg_chatter_select ON tg_messages;
CREATE POLICY tg_msg_chatter_select ON tg_messages FOR SELECT
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'chatter'
    AND conversation_id IN (
      SELECT c.id FROM tg_conversations c
      WHERE c.assigned_chatter_id = auth.uid()
         OR c.model_id IN (
           SELECT (elem)::uuid
           FROM profiles p, jsonb_array_elements_text(COALESCE(p.assigned_models, '[]'::jsonb)) AS elem
           WHERE p.id = auth.uid()
         )
    )
  );

DROP POLICY IF EXISTS audit_chatter_select ON audit_logs;
CREATE POLICY audit_chatter_select ON audit_logs FOR SELECT
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'chatter'
    AND target_type = 'tg_conversation'
    AND target_id IN (
      SELECT c.id FROM tg_conversations c
      WHERE c.assigned_chatter_id = auth.uid()
         OR c.model_id IN (
           SELECT (elem)::uuid
           FROM profiles p, jsonb_array_elements_text(COALESCE(p.assigned_models, '[]'::jsonb)) AS elem
           WHERE p.id = auth.uid()
         )
    )
  );
