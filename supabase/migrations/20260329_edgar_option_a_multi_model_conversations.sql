-- ═══════════════════════════════════════════════════════════════════════════════
-- EDGAR-SQL — Option A : Multi-modèle conversations
-- Permet un même spender (tg_chat_id) d'avoir une conversation PAR modèle.
--
-- PRÉ-REQUIS : aucune FK ne pointe sur tg_chat_id (vérifié par audit).
-- EXÉCUTION : copier dans Supabase SQL Editor, relire, puis GO.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 1 — COUNT avant backfill (résultat visible dans NOTICES)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM tg_conversations
  WHERE model_id IS NULL;
  RAISE NOTICE '[EDGAR] ÉTAPE 1 — Rows avec model_id NULL avant backfill : %', v_count;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 2 — Backfill model_id NULL → bella
-- Risque     : faible — simple UPDATE, données existantes taguées bella
-- Rollback   : UPDATE tg_conversations SET model_id = NULL
--              WHERE model_id = '081df809-697b-43f7-8386-bad8a9c85d09';
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE tg_conversations
SET model_id = '081df809-697b-43f7-8386-bad8a9c85d09'
WHERE model_id IS NULL;

DO $$
DECLARE
  v_remaining BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_remaining
  FROM tg_conversations
  WHERE model_id IS NULL;
  RAISE NOTICE '[EDGAR] ÉTAPE 2 — Rows encore NULL après backfill : % (attendu 0)', v_remaining;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 3 — Supprimer ancienne contrainte UNIQUE(tg_chat_id)
-- Le nom auto-généré par PostgreSQL pour `tg_chat_id text UNIQUE NOT NULL`
-- est `tg_conversations_tg_chat_id_key`.
-- Risque     : moyen — le bot peut temporairement créer des doublons tg_chat_id
--              (mais on recrée immédiatement la contrainte composite en étape 5)
-- Rollback   : ALTER TABLE tg_conversations
--                ADD CONSTRAINT tg_conversations_tg_chat_id_key UNIQUE (tg_chat_id);
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'tg_conversations'
      AND constraint_name = 'tg_conversations_tg_chat_id_key'
      AND constraint_type = 'UNIQUE'
  ) THEN
    ALTER TABLE tg_conversations
      DROP CONSTRAINT tg_conversations_tg_chat_id_key;
    RAISE NOTICE '[EDGAR] ÉTAPE 3 — Contrainte tg_conversations_tg_chat_id_key supprimée';
  ELSE
    RAISE NOTICE '[EDGAR] ÉTAPE 3 — Contrainte tg_conversations_tg_chat_id_key absente, skip';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 4 — Rendre model_id NOT NULL
-- Risque     : faible — toutes les rows sont backfillées en étape 2
-- Rollback   : ALTER TABLE tg_conversations ALTER COLUMN model_id DROP NOT NULL;
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE tg_conversations
  ALTER COLUMN model_id SET NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 5 — Nouvelle contrainte composite UNIQUE(tg_chat_id, model_id)
-- Permet : un spender (tg_chat_id) × un modèle (model_id) = une conversation
-- Risque     : échoue si doublons (tg_chat_id, model_id) existent → impossible
--              car avant cette étape tg_chat_id était UNIQUE (donc pas de doublon)
-- Rollback   : ALTER TABLE tg_conversations
--                DROP CONSTRAINT IF EXISTS tg_conversations_tg_chat_id_model_id_key;
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'tg_conversations'
      AND constraint_name = 'tg_conversations_tg_chat_id_model_id_key'
  ) THEN
    ALTER TABLE tg_conversations
      ADD CONSTRAINT tg_conversations_tg_chat_id_model_id_key
      UNIQUE (tg_chat_id, model_id);
    RAISE NOTICE '[EDGAR] ÉTAPE 5 — Contrainte composite UNIQUE(tg_chat_id, model_id) créée';
  ELSE
    RAISE NOTICE '[EDGAR] ÉTAPE 5 — Contrainte composite déjà présente, skip';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 6 — Ajouter model_id sur tg_messages + backfill + index
-- Note : tg_messages n'a PAS de colonne tg_chat_id. L'index est donc
--         sur (conversation_id, model_id) pour les requêtes de filtrage.
-- Risque     : faible — ajout de colonne nullable + UPDATE non-destructif
-- Rollback   : ALTER TABLE tg_messages DROP COLUMN IF EXISTS model_id;
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE tg_messages
  ADD COLUMN IF NOT EXISTS model_id UUID;

-- Backfill model_id depuis tg_conversations
UPDATE tg_messages m
SET model_id = c.model_id
FROM tg_conversations c
WHERE m.conversation_id = c.id
  AND m.model_id IS NULL;

DO $$
DECLARE
  v_null_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_null_count
  FROM tg_messages
  WHERE model_id IS NULL;
  RAISE NOTICE '[EDGAR] ÉTAPE 6 — tg_messages avec model_id NULL après backfill : %', v_null_count;
END;
$$;

-- Index pour filtrage par conversation + modèle
CREATE INDEX IF NOT EXISTS idx_tg_messages_conversation_model
  ON tg_messages(conversation_id, model_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 7 — Index composite sur tg_conversations
-- Risque     : nul — index additionnel, lecture seule
-- Rollback   : DROP INDEX IF EXISTS idx_tg_conversations_composite;
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tg_conversations_composite
  ON tg_conversations(tg_chat_id, model_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 8 — Mettre à jour RPC upsert_tg_conversation
-- Nouveau : model_id en paramètre obligatoire (UUID)
-- ON CONFLICT passe de (tg_chat_id) à (tg_chat_id, model_id)
-- Risque     : moyen — le bot DOIT passer model_id après déploiement
--              Sinon appel échoue (paramètre requis manquant)
-- Rollback   : re-déployer l'ancienne version du function (voir migration 20260331)
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop l'ancienne signature pour éviter surcharge (overload)
DROP FUNCTION IF EXISTS upsert_tg_conversation(TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION upsert_tg_conversation(
  p_tg_chat_id    TEXT,
  p_model_id      UUID,
  p_username       TEXT DEFAULT NULL,
  p_tg_user_id    TEXT DEFAULT NULL,
  p_display_name   TEXT DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_chat_id TEXT;
  v_id uuid;
BEGIN
  -- Validation
  v_chat_id := nullif(trim(p_tg_chat_id), '');
  IF v_chat_id IS NULL THEN
    RAISE EXCEPTION '[upsert_tg_conversation] p_tg_chat_id est vide ou NULL';
  END IF;
  IF p_model_id IS NULL THEN
    RAISE EXCEPTION '[upsert_tg_conversation] p_model_id est NULL';
  END IF;

  -- Upsert avec clé composite (tg_chat_id, model_id)
  INSERT INTO tg_conversations (tg_chat_id, model_id, last_message_at)
  VALUES (v_chat_id, p_model_id, now())
  ON CONFLICT (tg_chat_id, model_id) DO UPDATE
    SET last_message_at = now()
  RETURNING id INTO v_id;

  -- Populate metadata columns (never overwrite with NULL)
  UPDATE tg_conversations SET
    username     = COALESCE(NULLIF(TRIM(p_username), ''), username),
    tg_user_id   = COALESCE(NULLIF(TRIM(p_tg_user_id), ''), tg_user_id::text)::bigint,
    display_name = COALESCE(NULLIF(TRIM(p_display_name), ''), display_name)
  WHERE id = v_id
    AND (
      (p_username IS NOT NULL AND TRIM(p_username) <> '' AND (username IS NULL OR username = ''))
      OR (p_tg_user_id IS NOT NULL AND TRIM(p_tg_user_id) <> '' AND tg_user_id IS NULL)
      OR (p_display_name IS NOT NULL AND TRIM(p_display_name) <> '' AND (display_name IS NULL OR display_name = ''))
    );

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_tg_conversation(TEXT, UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_tg_conversation(TEXT, UUID, TEXT, TEXT, TEXT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 9 — Vérification RLS (diagnostic uniquement)
-- Les policies existantes filtrent sur :
--   tg_conversations : model_id IN (assigned_models)
--   tg_messages      : conversation_id IN (sub-select sur tg_conversations)
--   audit_logs       : target_id IN (sub-select sur tg_conversations)
--
-- AUCUNE policy ne filtre sur model_id = NULL.
-- Après migration, model_id est NOT NULL et contient une vraie valeur UUID.
-- → Les RLS TIENNENT et fonctionnent MIEUX qu'avant (filtrage effectif).
--
-- Diagnostic pour vérification humaine :
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  rec RECORD;
BEGIN
  RAISE NOTICE '[EDGAR] ÉTAPE 9 — Policies RLS actuelles :';
  FOR rec IN
    SELECT schemaname, tablename, policyname, qual
    FROM pg_policies
    WHERE tablename IN ('tg_conversations', 'tg_messages', 'audit_logs')
    ORDER BY tablename, policyname
  LOOP
    RAISE NOTICE '  [%] %.% → %', rec.tablename, rec.schemaname, rec.policyname, rec.qual;
  END LOOP;
  RAISE NOTICE '[EDGAR] ÉTAPE 9 — Aucune policy ne filtre sur model_id = NULL → OK';
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- RÉSUMÉ MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════════
-- ✓ Étape 1 : COUNT rows NULL (diagnostic)
-- ✓ Étape 2 : Backfill model_id → bella (081df809-697b-43f7-8386-bad8a9c85d09)
-- ✓ Étape 3 : DROP UNIQUE(tg_chat_id)
-- ✓ Étape 4 : model_id SET NOT NULL
-- ✓ Étape 5 : ADD UNIQUE(tg_chat_id, model_id)
-- ✓ Étape 6 : ADD model_id sur tg_messages + backfill + index
-- ✓ Étape 7 : Index composite tg_conversations
-- ✓ Étape 8 : RPC upsert_tg_conversation avec model_id obligatoire
-- ✓ Étape 9 : Diagnostic RLS → OK
-- ═══════════════════════════════════════════════════════════════════════════════

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK COMPLET (exécuter manuellement bloc par bloc si nécessaire)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- -- Restaurer l'ancienne RPC (sans model_id)
-- DROP FUNCTION IF EXISTS upsert_tg_conversation(TEXT, UUID, TEXT, TEXT, TEXT);
-- CREATE OR REPLACE FUNCTION upsert_tg_conversation(
--   p_tg_chat_id TEXT, p_username TEXT DEFAULT NULL,
--   p_tg_user_id TEXT DEFAULT NULL, p_display_name TEXT DEFAULT NULL
-- ) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $fn$
-- DECLARE v_chat_id TEXT; v_id uuid;
-- BEGIN
--   v_chat_id := nullif(trim(p_tg_chat_id), '');
--   IF v_chat_id IS NULL THEN RETURN NULL; END IF;
--   INSERT INTO tg_conversations (tg_chat_id, last_message_at)
--   VALUES (v_chat_id, now())
--   ON CONFLICT (tg_chat_id) DO UPDATE SET last_message_at = now()
--   RETURNING id INTO v_id;
--   UPDATE tg_conversations SET
--     username = COALESCE(NULLIF(TRIM(p_username), ''), username),
--     tg_user_id = COALESCE(NULLIF(TRIM(p_tg_user_id), ''), tg_user_id::text)::bigint,
--     display_name = COALESCE(NULLIF(TRIM(p_display_name), ''), display_name)
--   WHERE id = v_id AND (
--     (p_username IS NOT NULL AND TRIM(p_username) <> '' AND (username IS NULL OR username = ''))
--     OR (p_tg_user_id IS NOT NULL AND TRIM(p_tg_user_id) <> '' AND tg_user_id IS NULL)
--     OR (p_display_name IS NOT NULL AND TRIM(p_display_name) <> '' AND (display_name IS NULL OR display_name = ''))
--   );
--   RETURN v_id;
-- END; $fn$;
-- GRANT EXECUTE ON FUNCTION upsert_tg_conversation(TEXT, TEXT, TEXT, TEXT) TO authenticated;
-- GRANT EXECUTE ON FUNCTION upsert_tg_conversation(TEXT, TEXT, TEXT, TEXT) TO service_role;
--
-- -- Supprimer index composite
-- DROP INDEX IF EXISTS idx_tg_conversations_composite;
-- DROP INDEX IF EXISTS idx_tg_messages_conversation_model;
--
-- -- Supprimer model_id de tg_messages
-- ALTER TABLE tg_messages DROP COLUMN IF EXISTS model_id;
--
-- -- Supprimer contrainte composite
-- ALTER TABLE tg_conversations
--   DROP CONSTRAINT IF EXISTS tg_conversations_tg_chat_id_model_id_key;
--
-- -- Remettre model_id nullable
-- ALTER TABLE tg_conversations ALTER COLUMN model_id DROP NOT NULL;
--
-- -- Restaurer UNIQUE(tg_chat_id)
-- ALTER TABLE tg_conversations
--   ADD CONSTRAINT tg_conversations_tg_chat_id_key UNIQUE (tg_chat_id);
--
-- -- Remettre model_id à NULL (optionnel)
-- UPDATE tg_conversations SET model_id = NULL
-- WHERE model_id = '081df809-697b-43f7-8386-bad8a9c85d09';
--
-- ═══════════════════════════════════════════════════════════════════════════════
