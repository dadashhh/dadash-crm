-- ═══════════════════════════════════════════════════════════════════════════════
-- EDGAR-SQL — RLS Hardening post-Option A
-- Durcit toutes les policies après migration multi-modèle.
--
-- Périmètre :
--   1. tg_conversations — refonte SELECT par rôle
--   2. tg_messages       — refonte SELECT par rôle (model_id direct)
--   3. manager_chatters  — USING(true) → filtré
--   4. chatter_shifts    — USING(true) → filtré
--   5. manager_commissions — USING(true) → filtré
--   6. Vérification : pas de INSERT/UPDATE chatter sur tg_conversations
--
-- Bot (service_role) bypass RLS : OUI — aucun impact sur le pipeline.
-- ZÉRO EXÉCUTION — DADA valide et dit GO.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- RÈGLE 1 — tg_conversations SELECT
-- ─────────────────────────────────────────────────────────────────────────────
-- AVANT :
--   tg_conv_gerant_all     → gérant FOR ALL (OK, on garde)
--   tg_conv_chatter_select → chatter SELECT avec assigned_chatter_id OR
--                            (can_view_all_assigned AND model_id IN assigned_models)
--                            Problème : trop restrictif si can_view_all_assigned = false,
--                            et ne couvre pas manager_chatter.
-- APRÈS :
--   tg_conv_gerant_all     → inchangé (gérant full access)
--   conv_select_by_role    → chatter + manager_chatter voient model_id IN assigned_models
--                            (simplifié : plus besoin de can_view_all_assigned car
--                             le modèle est maintenant toujours renseigné)
-- RISQUE : un chatter qui avait can_view_all_assigned=false et voyait uniquement
--          ses convs assigned_chatter_id=moi verra maintenant aussi les convs
--          de ses modèles assignés. C'est le comportement VOULU post-Option A.
-- ROLLBACK : voir fin du fichier.
-- ─────────────────────────────────────────────────────────────────────────────

-- Supprimer l'ancienne policy chatter (remplacée)
DROP POLICY IF EXISTS tg_conv_chatter_select ON tg_conversations;

-- Nouvelle policy unifiée chatter + manager_chatter
CREATE POLICY conv_select_by_role ON tg_conversations
  FOR SELECT
  USING (
    -- Gérant voit tout (via tg_conv_gerant_all existante, FOR ALL)
    -- Chatter / manager_chatter : voit ses modèles assignés
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('chatter', 'manager_chatter')
    AND (
      -- Accès direct si assigné comme chatter de la conv
      assigned_chatter_id = auth.uid()
      OR
      -- Accès si le modèle de la conv est dans ses modèles assignés
      model_id IN (
        SELECT (elem)::uuid
        FROM profiles p,
             jsonb_array_elements_text(COALESCE(p.assigned_models, '[]'::jsonb)) AS elem
        WHERE p.id = auth.uid()
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- RÈGLE 2 — tg_messages SELECT
-- ─────────────────────────────────────────────────────────────────────────────
-- AVANT :
--   tg_msg_gerant_all      → gérant FOR ALL (OK, on garde)
--   tg_msg_chatter_select  → chatter SELECT via sub-select sur tg_conversations
--                            (lourd, indirection via conversation_id)
-- APRÈS :
--   tg_msg_gerant_all      → inchangé
--   msg_select_by_role     → filtre direct sur tg_messages.model_id
--                            (plus performant, model_id maintenant disponible)
-- RISQUE : même élargissement que RÈGLE 1 (voulu).
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tg_msg_chatter_select ON tg_messages;

CREATE POLICY msg_select_by_role ON tg_messages
  FOR SELECT
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('chatter', 'manager_chatter')
    AND (
      -- Accès direct via model_id (backfillé depuis tg_conversations)
      model_id IN (
        SELECT (elem)::uuid
        FROM profiles p,
             jsonb_array_elements_text(COALESCE(p.assigned_models, '[]'::jsonb)) AS elem
        WHERE p.id = auth.uid()
      )
      OR
      -- Fallback : message dans une conv où je suis assigned_chatter
      conversation_id IN (
        SELECT id FROM tg_conversations
        WHERE assigned_chatter_id = auth.uid()
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- RÈGLE 3 — manager_chatters (USING(true) → durcir)
-- ─────────────────────────────────────────────────────────────────────────────
-- AVANT : USING(true) WITH CHECK(true) → tout authenticated lit/écrit tout
-- APRÈS :
--   Gérant : ALL (full access pour gestion)
--   Manager : SELECT ses propres assignations (manager_id = moi)
--   Chatter : SELECT si je suis le chatter assigné (chatter_id = moi)
-- RISQUE : un chatter ne verra plus les assignations des autres chatters.
--          Un manager ne verra plus les assignations d'un autre manager.
--          C'est le comportement VOULU.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "manager_chatters_all" ON manager_chatters;

-- Gérant : full access
CREATE POLICY manager_chatters_gerant_all ON manager_chatters
  FOR ALL
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant');

-- Manager / Chatter : SELECT ses propres lignes
CREATE POLICY manager_chatters_own_select ON manager_chatters
  FOR SELECT
  USING (
    manager_id = auth.uid()
    OR chatter_id = auth.uid()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- RÈGLE 3b — chatter_shifts (USING(true) → durcir)
-- ─────────────────────────────────────────────────────────────────────────────
-- AVANT : USING(true) WITH CHECK(true)
-- APRÈS :
--   Gérant : ALL
--   Manager : SELECT shifts de ses chatters
--   Chatter : SELECT ses propres shifts
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "chatter_shifts_all" ON chatter_shifts;

-- Gérant : full access
CREATE POLICY chatter_shifts_gerant_all ON chatter_shifts
  FOR ALL
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant');

-- Manager : SELECT shifts de ses chatters assignés
CREATE POLICY chatter_shifts_manager_select ON chatter_shifts
  FOR SELECT
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager_chatter'
    AND (
      manager_id = auth.uid()
      OR chatter_id IN (
        SELECT mc.chatter_id FROM manager_chatters mc
        WHERE mc.manager_id = auth.uid()
      )
    )
  );

-- Chatter : SELECT ses propres shifts
CREATE POLICY chatter_shifts_chatter_select ON chatter_shifts
  FOR SELECT
  USING (
    chatter_id = auth.uid()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- RÈGLE 3c — manager_commissions (USING(true) → durcir)
-- ─────────────────────────────────────────────────────────────────────────────
-- AVANT : USING(true) WITH CHECK(true)
-- APRÈS :
--   Gérant : ALL
--   Manager : SELECT ses propres commissions uniquement
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "manager_commissions_all" ON manager_commissions;

-- Gérant : full access
CREATE POLICY manager_commissions_gerant_all ON manager_commissions
  FOR ALL
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant');

-- Manager : SELECT ses propres commissions
CREATE POLICY manager_commissions_own_select ON manager_commissions
  FOR SELECT
  USING (
    manager_id = auth.uid()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- RÈGLE 4 — Vérification : pas de INSERT/UPDATE chatter sur tg_conversations
-- ─────────────────────────────────────────────────────────────────────────────
-- Design validé par audit :
--   - tg_conv_gerant_all = FOR ALL → gérant peut INSERT/UPDATE/DELETE
--   - Aucune policy INSERT/UPDATE pour chatter → deny par défaut (RLS ON)
--   - Bot écrit via service_role → bypass RLS
-- → Rien à modifier. Ce bloc est un diagnostic de confirmation.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  rec RECORD;
  v_found BOOLEAN := false;
BEGIN
  RAISE NOTICE '[EDGAR-RLS] Vérification INSERT/UPDATE policies sur tg_conversations :';
  FOR rec IN
    SELECT policyname, cmd
    FROM pg_policies
    WHERE tablename = 'tg_conversations'
      AND cmd IN ('INSERT', 'UPDATE')
      AND policyname NOT LIKE '%gerant%'
  LOOP
    RAISE WARNING '[EDGAR-RLS] ⚠ Policy non-gérant INSERT/UPDATE trouvée : % (cmd=%)', rec.policyname, rec.cmd;
    v_found := true;
  END LOOP;
  IF NOT v_found THEN
    RAISE NOTICE '[EDGAR-RLS] ✓ Aucune policy INSERT/UPDATE non-gérant → deny par défaut OK';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Diagnostic final : lister toutes les policies post-migration
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  rec RECORD;
BEGIN
  RAISE NOTICE '[EDGAR-RLS] === POLICIES POST-MIGRATION ===';
  FOR rec IN
    SELECT tablename, policyname, cmd, qual
    FROM pg_policies
    WHERE tablename IN (
      'tg_conversations', 'tg_messages', 'audit_logs',
      'manager_chatters', 'chatter_shifts', 'manager_commissions'
    )
    ORDER BY tablename, policyname
  LOOP
    RAISE NOTICE '  [%] % (%)', rec.tablename, rec.policyname, rec.cmd;
  END LOOP;
END;
$$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (exécuter manuellement bloc par bloc si nécessaire)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- -- RÈGLE 1 : restaurer ancienne policy chatter tg_conversations
-- DROP POLICY IF EXISTS conv_select_by_role ON tg_conversations;
-- CREATE POLICY tg_conv_chatter_select ON tg_conversations
--   FOR SELECT
--   USING (
--     (SELECT role FROM profiles WHERE id = auth.uid()) = 'chatter'
--     AND (
--       assigned_chatter_id = auth.uid()
--       OR (
--         COALESCE(
--           (SELECT (p.messaging_permissions->>'can_view_all_assigned')::boolean
--            FROM profiles p WHERE p.id = auth.uid()),
--           false
--         ) = true
--         AND model_id IN (
--           SELECT (elem)::uuid
--           FROM profiles p2,
--                jsonb_array_elements_text(COALESCE(p2.assigned_models, '[]'::jsonb)) AS elem
--           WHERE p2.id = auth.uid()
--         )
--       )
--     )
--   );
--
-- -- RÈGLE 2 : restaurer ancienne policy chatter tg_messages
-- DROP POLICY IF EXISTS msg_select_by_role ON tg_messages;
-- CREATE POLICY tg_msg_chatter_select ON tg_messages
--   FOR SELECT
--   USING (
--     (SELECT role FROM profiles WHERE id = auth.uid()) = 'chatter'
--     AND conversation_id IN (
--       SELECT c.id FROM tg_conversations c
--       WHERE c.assigned_chatter_id = auth.uid()
--          OR (
--            COALESCE(
--              (SELECT (p.messaging_permissions->>'can_view_all_assigned')::boolean
--               FROM profiles p WHERE p.id = auth.uid()),
--              false
--            ) = true
--            AND c.model_id IN (
--              SELECT (elem)::uuid
--              FROM profiles p2,
--                   jsonb_array_elements_text(COALESCE(p2.assigned_models, '[]'::jsonb)) AS elem
--              WHERE p2.id = auth.uid()
--            )
--          )
--     )
--   );
--
-- -- RÈGLE 3 : restaurer USING(true) sur tables manager
-- DROP POLICY IF EXISTS manager_chatters_gerant_all ON manager_chatters;
-- DROP POLICY IF EXISTS manager_chatters_own_select ON manager_chatters;
-- CREATE POLICY "manager_chatters_all" ON manager_chatters
--   FOR ALL TO authenticated USING (true) WITH CHECK (true);
--
-- DROP POLICY IF EXISTS chatter_shifts_gerant_all ON chatter_shifts;
-- DROP POLICY IF EXISTS chatter_shifts_manager_select ON chatter_shifts;
-- DROP POLICY IF EXISTS chatter_shifts_chatter_select ON chatter_shifts;
-- CREATE POLICY "chatter_shifts_all" ON chatter_shifts
--   FOR ALL TO authenticated USING (true) WITH CHECK (true);
--
-- DROP POLICY IF EXISTS manager_commissions_gerant_all ON manager_commissions;
-- DROP POLICY IF EXISTS manager_commissions_own_select ON manager_commissions;
-- CREATE POLICY "manager_commissions_all" ON manager_commissions
--   FOR ALL TO authenticated USING (true) WITH CHECK (true);
--
-- ═══════════════════════════════════════════════════════════════════════════════
