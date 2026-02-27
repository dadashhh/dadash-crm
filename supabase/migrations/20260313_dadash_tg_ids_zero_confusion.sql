-- ═══════════════════════════════════════════════════════════════════════════════
-- DADASH — Zéro confusion IDs Telegram + pipeline spender auto
-- Date: 2026-03-13
-- Idempotent: IF NOT EXISTS, DO blocks, CREATE OR REPLACE
-- Aucune suppression brute de spender. Compatible données existantes.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- CONTEXTE:
-- - spenders.tg_user_id: peut être TEXT ou BIGINT selon migrations appliquées
-- - Doublons possibles pour un même tg_user_id
-- - transactions.spender_id -> spenders.id (FK, supprimer spender = 23503)
-- - Pipeline: création auto spender + enrich_queue à l'arrivée message/event
--
-- LIVRABLES:
-- 1) normalize_tg_user_id(input) -> text
-- 2) Colonnes/contraintes anti-doublon (unique sur tg_user_id normalisé)
-- 3) merge_spender(old_id, new_id) — réaffecte FK, archive, log
-- 4) Pipeline: trigger tg_messages + spender_events → upsert spender + enrich_queue
-- 5) Views stables compat (v_spenders, v_tg_conversations, v_activity_feed, v_spender_enrichments)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE -1 — DROP views dépendantes AVANT ALTER COLUMN (évite erreur 0A000)
-- Les views seront recréées par 20260313_dadash_pipeline_compat.sql
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_activity_new_spenders;
DROP VIEW IF EXISTS public.v_activity_enrichments;
DROP VIEW IF EXISTS public.v_activity_messages;
DROP VIEW IF EXISTS public.v_activity_feed;
DROP VIEW IF EXISTS public.v_spender_enrich_queue;
DROP VIEW IF EXISTS public.v_spender_enrichments;
DROP VIEW IF EXISTS public.v_spender_events;
DROP VIEW IF EXISTS public.v_spenders;
DROP VIEW IF EXISTS public.v_tg_conversations;
DROP VIEW IF EXISTS public.v_tg_messages;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 0 — Colonnes spenders pour merge (is_active, merged_into_id)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES public.spenders(id);

CREATE INDEX IF NOT EXISTS idx_spenders_is_active ON public.spenders (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_spenders_merged_into ON public.spenders (merged_into_id) WHERE merged_into_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 1 — normalize_tg_user_id(input text) -> text
-- Format canonique: digits only. Gère NULL, '', espaces, préfixes.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.normalize_tg_user_id(input_val TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean TEXT;
BEGIN
  IF input_val IS NULL OR trim(input_val) = '' THEN
    RETURN NULL;
  END IF;
  -- Extraire uniquement les chiffres
  v_clean := regexp_replace(trim(input_val), '[^0-9]', '', 'g');
  IF v_clean = '' THEN
    RETURN NULL;
  END IF;
  RETURN v_clean;
END;
$$;

-- Overload pour BIGINT (compat)
CREATE OR REPLACE FUNCTION public.normalize_tg_user_id(input_val BIGINT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN input_val IS NULL THEN NULL ELSE input_val::text END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 2 — Standardiser spenders.tg_user_id en TEXT (digits)
-- Migration safe: si BIGINT, convertir; si déjà TEXT, normaliser.
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  col_type TEXT;
BEGIN
  SELECT data_type INTO col_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'spenders'
     AND column_name  = 'tg_user_id';

  IF col_type IS NULL THEN
    ALTER TABLE public.spenders ADD COLUMN tg_user_id TEXT;
  ELSIF col_type = 'bigint' THEN
    -- Migrer BIGINT -> TEXT (digits)
    ALTER TABLE public.spenders
      ALTER COLUMN tg_user_id TYPE TEXT USING tg_user_id::text;
  END IF;
  -- Si déjà text, rien à faire
END $$;

-- Normaliser les valeurs existantes (digits only)
UPDATE public.spenders
   SET tg_user_id = public.normalize_tg_user_id(tg_user_id)
 WHERE tg_user_id IS NOT NULL
   AND tg_user_id ~ '[^0-9]';

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 3 — Unique index sur tg_user_id normalisé (après merge des doublons)
-- Si des doublons existent, l'index n'est pas créé — exécuter merge_spender d'abord.
-- ═══════════════════════════════════════════════════════════════════════════════
DROP INDEX IF EXISTS public.uq_spenders_tg_user_id;
DROP INDEX IF EXISTS public.uq_spenders_tg_user_id_normalized;

DO $$
BEGIN
  -- Ne créer l'index que s'il n'y a pas de doublons
  IF NOT EXISTS (
    SELECT 1 FROM (
      SELECT public.normalize_tg_user_id(tg_user_id) AS n
      FROM public.spenders
      WHERE tg_user_id IS NOT NULL AND is_active = true
    ) x
    GROUP BY n HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX uq_spenders_tg_user_id_normalized
      ON public.spenders (public.normalize_tg_user_id(tg_user_id))
      WHERE tg_user_id IS NOT NULL AND is_active = true;
  END IF;
END $$;

-- Index pour lookups directs
CREATE INDEX IF NOT EXISTS idx_spenders_tg_user_id_text
  ON public.spenders (tg_user_id)
  WHERE tg_user_id IS NOT NULL AND is_active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 4 — Adapter spender_events.tg_user_id (TEXT pour cohérence)
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  col_type TEXT;
BEGIN
  SELECT data_type INTO col_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'spender_events'
     AND column_name  = 'tg_user_id';

  IF col_type = 'bigint' THEN
    ALTER TABLE public.spender_events
      ALTER COLUMN tg_user_id TYPE TEXT USING tg_user_id::text;
  ELSIF col_type IS NULL THEN
    ALTER TABLE public.spender_events ADD COLUMN tg_user_id TEXT;
  END IF;
END $$;

-- spender_events: idempotency unique (event_type, tg_user_id, idempotency_key)
DROP INDEX IF EXISTS public.uq_spender_events_dedup;
CREATE UNIQUE INDEX uq_spender_events_dedup
  ON public.spender_events (event_type, tg_user_id, idempotency_key);

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 5 — spender_enrich_queue.tg_user_id TEXT
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  col_type TEXT;
BEGIN
  SELECT data_type INTO col_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'spender_enrich_queue'
     AND column_name  = 'tg_user_id';

  IF col_type = 'bigint' THEN
    ALTER TABLE public.spender_enrich_queue
      ALTER COLUMN tg_user_id TYPE TEXT USING tg_user_id::text;
  ELSIF col_type IS NULL THEN
    ALTER TABLE public.spender_enrich_queue ADD COLUMN tg_user_id TEXT;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 6 — tg_conversations.tg_user_id (garder flexible: TEXT pour compat)
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  col_type TEXT;
BEGIN
  SELECT data_type INTO col_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'tg_conversations'
     AND column_name  = 'tg_user_id';

  IF col_type = 'bigint' THEN
    ALTER TABLE public.tg_conversations
      ALTER COLUMN tg_user_id TYPE TEXT USING tg_user_id::text;
  ELSIF col_type IS NULL THEN
    ALTER TABLE public.tg_conversations ADD COLUMN tg_user_id TEXT;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 7 — merge_spender(old_id uuid, new_id uuid)
-- Réaffecte toutes les FK, archive old, log event.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.merge_spender(p_old_id UUID, p_new_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_tg  TEXT;
  v_new_tg  TEXT;
  v_count   JSONB := '{}'::jsonb;
  v_tx      INT := 0;
  v_conv    INT := 0;
  v_ev      INT := 0;
  v_push    INT := 0;
  v_plat    INT := 0;
  v_wa      INT := 0;
BEGIN
  IF p_old_id = p_new_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'old_id = new_id');
  END IF;

  SELECT tg_user_id INTO v_old_tg FROM public.spenders WHERE id = p_old_id;
  SELECT tg_user_id INTO v_new_tg FROM public.spenders WHERE id = p_new_id;

  IF v_old_tg IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'old spender not found');
  END IF;
  IF v_new_tg IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'new spender not found');
  END IF;

  -- 1) transactions
  UPDATE public.transactions SET spender_id = p_new_id WHERE spender_id = p_old_id;
  GET DIAGNOSTICS v_tx = ROW_COUNT;

  -- 2) tg_conversations
  UPDATE public.tg_conversations SET spender_id = p_new_id WHERE spender_id = p_old_id;
  GET DIAGNOSTICS v_conv = ROW_COUNT;

  -- 3) spender_events
  UPDATE public.spender_events SET spender_id = p_new_id WHERE spender_id = p_old_id;
  GET DIAGNOSTICS v_ev = ROW_COUNT;

  -- 4) push_recipients (si table existe)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'push_recipients') THEN
    UPDATE public.push_recipients SET spender_id = p_new_id WHERE spender_id = p_old_id;
    GET DIAGNOSTICS v_push = ROW_COUNT;
  END IF;

  -- 5) platform_fans (si existe)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'platform_fans') THEN
    UPDATE public.platform_fans SET spender_id = p_new_id WHERE spender_id = p_old_id;
    GET DIAGNOSTICS v_plat = ROW_COUNT;
  END IF;

  -- 6) wa_analysis_logs (si existe)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'wa_analysis_logs') THEN
    UPDATE public.wa_analysis_logs SET spender_id = p_new_id WHERE spender_id = p_old_id;
    GET DIAGNOSTICS v_wa = ROW_COUNT;
  END IF;

  -- 7) Archiver old spender (jamais DELETE)
  UPDATE public.spenders
     SET is_active = false,
         merged_into_id = p_new_id,
         updated_at = now()
   WHERE id = p_old_id;

  -- 8) Log event
  INSERT INTO public.spender_events (tg_user_id, spender_id, event_type, idempotency_key, data)
  VALUES (
    v_new_tg,
    p_new_id,
    'spender_merged',
    'merge:' || p_old_id::text || '->' || p_new_id::text,
    jsonb_build_object(
      'summary', 'Spender fusionné',
      'old_id', p_old_id,
      'new_id', p_new_id,
      'counts', jsonb_build_object(
        'transactions', v_tx,
        'tg_conversations', v_conv,
        'spender_events', v_ev,
        'push_recipients', v_push,
        'platform_fans', v_plat,
        'wa_analysis_logs', v_wa
      )
    )
  );

  -- Étendre event_type pour spender_merged
  PERFORM 1;

  RETURN jsonb_build_object(
    'ok', true,
    'old_id', p_old_id,
    'new_id', p_new_id,
    'counts', jsonb_build_object(
      'transactions', v_tx,
      'tg_conversations', v_conv,
      'spender_events', v_ev,
      'push_recipients', v_push,
      'platform_fans', v_plat,
      'wa_analysis_logs', v_wa
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_spender(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_spender(UUID, UUID) TO service_role;

-- Étendre event_type pour spender_merged
DO $$
BEGIN
  UPDATE public.spender_events SET event_type = 'unknown'
   WHERE event_type IS NULL
      OR event_type NOT IN (
        'new_spender', 'profile_updated', 'new_message', 'status_changed',
        'classification_changed', 'spender_created', 'tx_created', 'handle_set',
        'enriched', 'spender_enriched', 'message', 'spender_merged', 'unknown'
      );
  ALTER TABLE public.spender_events DROP CONSTRAINT IF EXISTS chk_spender_events_event_type;
  ALTER TABLE public.spender_events
    ADD CONSTRAINT chk_spender_events_event_type
    CHECK (event_type IN (
      'new_spender', 'profile_updated', 'new_message', 'status_changed',
      'classification_changed', 'spender_created', 'tx_created', 'handle_set',
      'enriched', 'spender_enriched', 'message', 'spender_merged', 'unknown'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
