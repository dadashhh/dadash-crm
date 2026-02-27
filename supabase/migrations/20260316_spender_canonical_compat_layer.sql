-- ═══════════════════════════════════════════════════════════════════════════════
-- DADASH — Compat layer canonique + normalisation profil spender
-- Objectif: 1 seule API de lecture stable, enrichissement stocké de façon robuste
-- Date: 2026-03-16
-- Idempotent, pas de breaking change, FK transactions préservée
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 0 — Colonnes spenders (additive)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS profile_updated_at TIMESTAMPTZ;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS relationship_status TEXT;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS telegram_id TEXT;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS budget_range TEXT;

-- Backfill profile_updated_at depuis updated_at pour les lignes existantes
UPDATE public.spenders
   SET profile_updated_at = COALESCE(profile_updated_at, updated_at, created_at)
 WHERE profile_updated_at IS NULL AND (updated_at IS NOT NULL OR created_at IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 1 — Helper: normalize_tg_user_id (si absent)
-- Retourne TEXT digits-only pour comparaisons cohérentes (bigint ou text → text)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.normalize_tg_user_id(input_val TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v_clean TEXT;
BEGIN
  IF input_val IS NULL OR trim(input_val) = '' THEN RETURN NULL; END IF;
  v_clean := regexp_replace(trim(input_val), '[^0-9]', '', 'g');
  IF v_clean = '' THEN RETURN NULL; END IF;
  RETURN v_clean;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_tg_user_id(input_val BIGINT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN input_val IS NULL THEN NULL ELSE input_val::text END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 2 — v_spenders (view canonique, colonnes normalisées)
-- L'UI lit UNIQUEMENT cette view. Pas de parsing JSON arbitraire.
-- tg_user_id_text: pour comparaison JS (String(x) === String(y))
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_spenders;
CREATE VIEW public.v_spenders AS
SELECT
  s.id,
  s.tg_user_id,
  -- Cast cohérent pour comparaison app (bigint ou text → text)
  public.normalize_tg_user_id(s.tg_user_id) AS tg_user_id_text,
  COALESCE(s.telegram_id, public.normalize_tg_user_id(s.tg_user_id)) AS telegram_id,
  -- Identité
  COALESCE(NULLIF(TRIM(s.handle), ''), s.telegram_username, s.meta->'profile'->'telegram'->>'username',
    CASE WHEN s.tg_user_id IS NOT NULL THEN 'tg_' || public.normalize_tg_user_id(s.tg_user_id) ELSE 'id:' || s.id::text END) AS username,
  COALESCE(NULLIF(TRIM(s.handle), ''), s.telegram_username, s.meta->'profile'->'telegram'->>'username',
    CASE WHEN s.tg_user_id IS NOT NULL THEN 'tg_' || public.normalize_tg_user_id(s.tg_user_id) ELSE 'id:' || s.id::text END) AS handle,
  COALESCE(NULLIF(TRIM(s.display_name), ''), NULLIF(TRIM(s.name), ''), s.meta->'profile'->'telegram'->>'display') AS display_name,
  COALESCE(NULLIF(TRIM(s.display_name), ''), NULLIF(TRIM(s.name), ''), s.meta->'profile'->'telegram'->>'display') AS name,
  -- Profil normalisé (colonne top-level prioritaire, puis meta)
  COALESCE(s.first_name, s.meta->'profile'->'identity'->>'first_name', s.meta->'profile'->'telegram'->>'first_name', s.meta->'profile'->>'first_name') AS first_name,
  COALESCE(s.age, (s.meta->'profile'->'identity'->>'age')::int, (s.meta->'profile'->>'age')::int) AS age,
  COALESCE(s.job, s.meta->'profile'->>'job') AS job,
  COALESCE(s.city, s.meta->'profile'->'location'->>'city', s.meta->'profile'->>'city') AS city,
  COALESCE(s.country, s.meta->'profile'->'location'->>'country', s.meta->'profile'->>'country') AS country,
  COALESCE(s.langue, s.meta->'profile'->>'language', s.meta->'profile'->>'langue') AS language,
  COALESCE(s.langue, s.meta->'profile'->>'language', s.meta->'profile'->>'langue') AS langue,
  COALESCE(s.notes, s.meta->'profile'->>'notes_chatter') AS notes_chatter,
  COALESCE(s.notes, s.meta->'profile'->>'notes_chatter') AS notes,
  COALESCE(s.relationship_status, s.meta->'profile'->>'relationship_status', (s.meta->'profile'->'status'->>'relation')) AS relationship,
  COALESCE(s.relationship_status, s.meta->'profile'->>'relationship_status', (s.meta->'profile'->'status'->>'relation')) AS relationship_status,
  COALESCE(s.source, s.meta->'profile'->>'source') AS source,
  COALESCE(s.budget_range, s.meta->'profile'->>'budget_range') AS budget_range,
  COALESCE(s.timezone, s.meta->'profile'->'location'->>'timezone', s.meta->'profile'->>'timezone') AS timezone,
  s.whatsapp_phone,
  -- Meta (lecture seule, pour debug/legacy)
  COALESCE(s.meta, '{}'::jsonb) AS meta,
  -- Statut / dates
  COALESCE(s.status, 'active') AS status,
  s.telegram_username,
  s.classification,
  COALESCE(s.created_at, now()) AS created_at,
  COALESCE(s.updated_at, s.created_at, now()) AS updated_at,
  COALESCE(s.profile_updated_at, s.updated_at, s.created_at, now()) AS profile_updated_at,
  COALESCE(s.last_seen_at, s.updated_at, s.created_at, now()) AS last_activity_at
FROM public.spenders s
WHERE (NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='spenders' AND column_name='is_active')
       OR s.is_active = true);

GRANT SELECT ON public.v_spenders TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 3 — Indexes (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_spenders_tg_user_id
  ON public.spenders (tg_user_id) WHERE tg_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spenders_handle_lower
  ON public.spenders (LOWER(TRIM(handle))) WHERE handle IS NOT NULL AND trim(handle) <> '';
CREATE INDEX IF NOT EXISTS idx_spenders_updated_at_desc
  ON public.spenders (updated_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_spenders_profile_updated_at
  ON public.spenders (profile_updated_at DESC NULLS LAST) WHERE profile_updated_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 4 — fn_spender_apply_enrichment(spender_id, patch_json, source)
-- API simplifiée: applique un patch d'enrichissement, met à jour meta + colonnes
-- + profile_updated_at. Source = 'telegram_autofill' | 'manual' | 'api'
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_spender_apply_enrichment(
  p_spender_id UUID,
  p_patch      JSONB,
  p_source     TEXT DEFAULT 'telegram_autofill'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tg_user_id BIGINT;
  v_tg_text    TEXT;
  v_result      JSONB;
BEGIN
  IF p_patch IS NULL OR p_patch = '{}'::jsonb THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_patch');
  END IF;

  SELECT COALESCE(tg_user_id::text, '0') INTO v_tg_text FROM public.spenders WHERE id = p_spender_id;
  IF NOT FOUND OR v_tg_text IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'spender_not_found');
  END IF;

  -- Appel compatible BIGINT ou TEXT (selon overloads existants)
  IF v_tg_text ~ '^\d+$' THEN
    v_tg_user_id := v_tg_text::bigint;
  ELSE
    v_tg_user_id := 0;
  END IF;

  BEGIN
    v_result := public.fn_apply_spender_enrichment(p_spender_id, v_tg_user_id, p_patch);
  EXCEPTION WHEN SQLSTATE '42883' THEN
    v_result := public.fn_apply_spender_enrichment(p_spender_id, v_tg_text, p_patch);
  END;

  -- Mettre à jour profile_updated_at
  UPDATE public.spenders SET profile_updated_at = now() WHERE id = p_spender_id;

  RETURN v_result || jsonb_build_object('ok', true, 'source', p_source);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- Overload sans source
DROP FUNCTION IF EXISTS public.fn_spender_apply_enrichment(UUID, JSONB);
CREATE FUNCTION public.fn_spender_apply_enrichment(p_spender_id UUID, p_patch JSONB)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER AS $$
  SELECT public.fn_spender_apply_enrichment(p_spender_id, p_patch, 'telegram_autofill');
$$;

GRANT EXECUTE ON FUNCTION public.fn_spender_apply_enrichment(UUID, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_spender_apply_enrichment(UUID, JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_spender_apply_enrichment(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_spender_apply_enrichment(UUID, JSONB) TO service_role;

-- Trigger: profile_updated_at sur fn_apply_spender_enrichment (via wrapper)
-- On modifie fn_apply_spender_enrichment pour aussi setter profile_updated_at
DO $$
BEGIN
  -- Vérifier si fn_apply_spender_enrichment existe (signature UUID, BIGINT, JSONB)
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
             WHERE n.nspname = 'public' AND p.proname = 'fn_apply_spender_enrichment') THEN
    -- Créer une version qui met à jour profile_updated_at (wrapper ou patch)
    -- On ne peut pas modifier la fonction existante sans la recréer. On s'appuie sur fn_spender_apply_enrichment.
    NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 5 — fn_merge_spenders(old_id, new_id)
-- Alias pour merge_spender. Réaffecte toutes les FK, archive l'ancien.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_merge_spenders(p_old_id UUID, p_new_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
             WHERE n.nspname = 'public' AND p.proname = 'merge_spender') THEN
    RETURN public.merge_spender(p_old_id, p_new_id);
  ELSE
    -- Implémentation minimale si merge_spender n'existe pas
    UPDATE public.transactions SET spender_id = p_new_id WHERE spender_id = p_old_id;
    UPDATE public.tg_conversations SET spender_id = p_new_id WHERE spender_id = p_old_id;
    UPDATE public.spender_events SET spender_id = p_new_id WHERE spender_id = p_old_id;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='push_recipients') THEN
      UPDATE public.push_recipients SET spender_id = p_new_id WHERE spender_id = p_old_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='spenders' AND column_name='is_active') THEN
      UPDATE public.spenders SET is_active = false, merged_into_id = p_new_id, updated_at = now() WHERE id = p_old_id;
    ELSE
      -- Pas de soft delete: on garde l'ancien (éviter orphelins)
      NULL;
    END IF;
    RETURN jsonb_build_object('ok', true, 'old_id', p_old_id, 'new_id', p_new_id);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_merge_spenders(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_merge_spenders(UUID, UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 6 — v_tg_conversations (compat layer)
-- Fallbacks pour tg_username, username, display_name si colonnes absentes
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Ajouter colonnes manquantes à tg_conversations
  ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS tg_user_id BIGINT;
  ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS tg_peer_id TEXT;
  ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS tg_username TEXT;
  ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS username TEXT;
  ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS display_name TEXT;
END $$;

DROP VIEW IF EXISTS public.v_tg_conversations;
CREATE VIEW public.v_tg_conversations AS
SELECT
  c.id,
  c.tg_chat_id,
  COALESCE(c.tg_peer_id, c.tg_chat_id) AS tg_peer_id,
  COALESCE(
    CASE WHEN c.tg_user_id IS NOT NULL AND (c.tg_user_id::text) ~ '^\d+$' THEN (c.tg_user_id::text)::BIGINT ELSE NULL END,
    CASE WHEN c.tg_chat_id ~ '^\d+$' THEN (c.tg_chat_id)::BIGINT ELSE NULL END
  ) AS tg_user_id,
  c.spender_id,
  c.model_id,
  c.assigned_chatter_id,
  c.status,
  c.last_message_at,
  c.created_at,
  COALESCE(NULLIF(TRIM(c.tg_username), ''), NULLIF(TRIM(c.username), ''), s.telegram_username,
    s.meta->'profile'->'telegram'->>'username', 'tg_' || COALESCE(c.tg_user_id::text, c.tg_chat_id)) AS tg_username,
  COALESCE(NULLIF(TRIM(c.username), ''), NULLIF(TRIM(c.tg_username), ''), s.telegram_username,
    s.meta->'profile'->'telegram'->>'username', 'tg_' || COALESCE(c.tg_user_id::text, c.tg_chat_id)) AS username,
  COALESCE(NULLIF(TRIM(c.display_name), ''), s.name, s.meta->'profile'->'telegram'->>'display',
    'tg_' || COALESCE(c.tg_user_id::text, c.tg_chat_id)) AS display_name
FROM public.tg_conversations c
LEFT JOIN public.spenders s ON s.id = c.spender_id
  OR (c.tg_user_id IS NOT NULL AND public.normalize_tg_user_id(s.tg_user_id) = public.normalize_tg_user_id(c.tg_user_id))
  OR (c.tg_chat_id ~ '^\d+$' AND public.normalize_tg_user_id(s.tg_user_id) = regexp_replace(c.tg_chat_id, '[^0-9]', '', 'g'));

GRANT SELECT ON public.v_tg_conversations TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 7 — Mise à jour fn_apply_spender_enrichment pour profile_updated_at
-- (Patch: ajouter SET profile_updated_at = now() dans l'UPDATE)
-- On crée un trigger sur spender_events profile_updated pour backfill
-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: quand spender_events reçoit profile_updated, mettre à jour profile_updated_at
CREATE OR REPLACE FUNCTION public.tg_spender_profile_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.event_type IN ('profile_updated', 'enriched', 'spender_enriched') AND NEW.spender_id IS NOT NULL THEN
    UPDATE public.spenders SET profile_updated_at = now() WHERE id = NEW.spender_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_spender_profile_updated_at ON public.spender_events;
CREATE TRIGGER trg_spender_profile_updated_at
  AFTER INSERT ON public.spender_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_spender_profile_updated_at();

COMMIT;
