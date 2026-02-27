-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX BOT AUTOFILL — spender_events constraints + best-effort insert (PROD)
-- Résout:
--   ERROR 23514 : chk_spender_events_event_type rejette 'spender_enriched'
--   ERROR 42P10 : no unique/exclusion constraint matching ON CONFLICT
-- Stratégie:
--   A) CHECK constraint → non-vide seulement (permissif, extensible)
--   B) Unique index partiel WHERE idempotency_key IS NOT NULL
--   C) fn_upsert_spender_from_tg (TEXT) — EXCEPTION best-effort + WHERE clause
--   D) fn_apply_spender_enrichment (TEXT) — idem
--   E) fn_insert_spender_event (TEXT) — idem
-- Idempotent: DO blocks, DROP IF EXISTS, CREATE OR REPLACE
-- Date: 2026-03-29
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- A) CHECK constraint — remplacer la whitelist stricte par un check non-vide
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  chk_name text;
BEGIN
  -- Trouver TOUS les CHECK sur event_type et les supprimer
  FOR chk_name IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'public.spender_events'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%event_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.spender_events DROP CONSTRAINT IF EXISTS %I', chk_name);
  END LOOP;

  -- Ajouter le check permissif (non-vide) si absent
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
     WHERE constraint_schema = 'public'
       AND constraint_name   = 'chk_spender_events_event_type_nonempty'
  ) THEN
    ALTER TABLE public.spender_events
      ADD CONSTRAINT chk_spender_events_event_type_nonempty
      CHECK (event_type IS NOT NULL AND length(trim(event_type)) > 0);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- B) Unique index partiel compatible ON CONFLICT ... WHERE idempotency_key IS NOT NULL
--    Remplace uq_spender_events_dedup (non-partiel, potentiellement incohérent)
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.uq_spender_events_dedup;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename  = 'spender_events'
       AND indexname  = 'ux_spender_events_idem'
  ) THEN
    CREATE UNIQUE INDEX ux_spender_events_idem
      ON public.spender_events (event_type, tg_user_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- C) fn_upsert_spender_from_tg (TEXT) — best-effort spender_events
--    ON CONFLICT avec WHERE idempotency_key IS NOT NULL
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_upsert_spender_from_tg(
  p_tg_user_id    TEXT,
  p_username      TEXT DEFAULT NULL,
  p_display_name  TEXT DEFAULT NULL,
  p_first_name    TEXT DEFAULT NULL,
  p_meta          JSONB DEFAULT '{}'::jsonb,
  p_source        TEXT DEFAULT 'telegram_sync'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id       UUID;
  v_handle   TEXT;
  v_name     TEXT;
  v_meta     JSONB;
  v_norm     TEXT;
  v_existing RECORD;
BEGIN
  v_norm := public.normalize_tg_user_id(p_tg_user_id);
  IF v_norm IS NULL OR v_norm = '' THEN
    RETURN NULL;
  END IF;

  v_handle := COALESCE(NULLIF(TRIM(p_username), ''), 'tg_' || v_norm);
  v_name   := COALESCE(NULLIF(TRIM(p_display_name), ''), NULLIF(TRIM(p_first_name), ''), v_handle);

  SELECT id, meta INTO v_existing
    FROM public.spenders
   WHERE public.normalize_tg_user_id(tg_user_id) = v_norm
     AND is_active = true
   LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    -- Spender existant: update
    v_id   := v_existing.id;
    v_meta := COALESCE(v_existing.meta, '{}'::jsonb);
    IF p_meta IS NOT NULL AND p_meta <> '{}'::jsonb THEN
      v_meta := COALESCE(public.jsonb_deep_merge(v_meta, p_meta), v_meta);
    END IF;

    UPDATE public.spenders
       SET handle            = COALESCE(NULLIF(TRIM(handle), ''), v_handle),
           display_name      = COALESCE(NULLIF(TRIM(display_name), ''), NULLIF(TRIM(p_display_name), '')),
           name              = COALESCE(NULLIF(TRIM(name), ''), v_name),
           first_name        = COALESCE(first_name, NULLIF(TRIM(p_first_name), '')),
           telegram_username = COALESCE(telegram_username, TRIM(BOTH '@' FROM COALESCE(p_username, ''))),
           meta              = v_meta,
           tg_user_id        = v_norm,
           last_seen_at      = now(),
           updated_at        = now()
     WHERE id = v_id;

    -- Best-effort: ne jamais faire échouer l'ingestion pour un log
    BEGIN
      INSERT INTO public.spender_events (tg_user_id, spender_id, event_type, idempotency_key, data)
      VALUES (
        v_norm, v_id, 'spender_enriched',
        'tg:' || v_norm || ':sync:' || extract(epoch from now())::bigint,
        jsonb_build_object('summary', 'Spender mis à jour', 'source', p_source)
      )
      ON CONFLICT (event_type, tg_user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'spender_events insert failed (spender_enriched tg=%): %', v_norm, SQLERRM;
    END;

  ELSE
    -- Nouveau spender
    INSERT INTO public.spenders
      (tg_user_id, handle, name, display_name, first_name, telegram_username, meta, status, last_seen_at)
    VALUES (
      v_norm, v_handle, v_name,
      NULLIF(TRIM(p_display_name), ''), NULLIF(TRIM(p_first_name), ''),
      TRIM(BOTH '@' FROM COALESCE(p_username, '')),
      COALESCE(p_meta, '{}'::jsonb), 'active', now()
    )
    RETURNING id INTO v_id;

    BEGIN
      INSERT INTO public.spender_events (tg_user_id, spender_id, event_type, idempotency_key, data)
      VALUES (
        v_norm, v_id, 'new_spender',
        'tg:' || v_norm || ':created',
        jsonb_build_object('summary', 'Nouveau spender', 'handle', v_handle, 'source', p_source)
      )
      ON CONFLICT (event_type, tg_user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'spender_events insert failed (new_spender tg=%): %', v_norm, SQLERRM;
    END;
  END IF;

  RETURN v_id;
END;
$$;

-- Wrapper BIGINT (compat)
DROP FUNCTION IF EXISTS public.fn_upsert_spender_from_tg(BIGINT, TEXT, TEXT, TEXT, JSONB, TEXT);
DROP FUNCTION IF EXISTS public.fn_upsert_spender_from_tg(BIGINT, TEXT, TEXT, JSONB);
CREATE FUNCTION public.fn_upsert_spender_from_tg(p_tg BIGINT, p_user TEXT, p_disp TEXT, p_meta JSONB)
RETURNS UUID LANGUAGE sql SECURITY DEFINER AS $$
  SELECT public.fn_upsert_spender_from_tg(p_tg::text, p_user, p_disp, NULL, p_meta, 'telegram_sync');
$$;

GRANT EXECUTE ON FUNCTION public.fn_upsert_spender_from_tg(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_upsert_spender_from_tg(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_upsert_spender_from_tg(BIGINT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_upsert_spender_from_tg(BIGINT, TEXT, TEXT, JSONB) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- D) fn_apply_spender_enrichment (TEXT) — best-effort spender_events
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_apply_spender_enrichment(
  p_spender_id   UUID,
  p_tg_user_id   TEXT,
  p_enrichment   JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_meta      JSONB;
  v_added     TEXT[] := '{}';
  v_updated   TEXT[] := '{}';
  v_profile   JSONB;
  v_identity  JSONB;
  v_location  JSONB;
  v_tg_norm   TEXT;
BEGIN
  v_tg_norm := public.normalize_tg_user_id(p_tg_user_id);
  IF v_tg_norm IS NULL THEN v_tg_norm := p_tg_user_id; END IF;

  IF p_enrichment IS NULL OR p_enrichment = '{}'::jsonb THEN
    RETURN jsonb_build_object('added', '[]'::jsonb, 'updated', '[]'::jsonb);
  END IF;

  SELECT meta INTO v_meta FROM public.spenders WHERE id = p_spender_id;
  IF v_meta IS NULL THEN v_meta := '{}'::jsonb; END IF;

  v_profile  := COALESCE(v_meta->'profile',           '{}'::jsonb);
  v_identity := COALESCE(v_profile->'identity',       '{}'::jsonb);
  v_location := COALESCE(v_profile->'location',       '{}'::jsonb);

  IF p_enrichment ? 'age' AND p_enrichment->'age' IS NOT NULL THEN
    v_identity := v_identity || jsonb_build_object('age', (p_enrichment->>'age')::int);
    v_added := array_append(v_added, 'age');
  END IF;
  IF p_enrichment ? 'first_name' AND p_enrichment->>'first_name' <> '' THEN
    v_identity := v_identity || jsonb_build_object('first_name', p_enrichment->>'first_name');
    v_added := array_append(v_added, 'first_name');
  END IF;
  IF p_enrichment ? 'city' AND p_enrichment->>'city' <> '' THEN
    v_location := v_location || jsonb_build_object('city', p_enrichment->>'city');
    v_added := array_append(v_added, 'city');
  END IF;
  IF p_enrichment ? 'country' AND p_enrichment->>'country' <> '' THEN
    v_location := v_location || jsonb_build_object('country', p_enrichment->>'country');
    v_added := array_append(v_added, 'country');
  END IF;
  IF p_enrichment ? 'job' THEN
    v_profile := v_profile || jsonb_build_object('job', p_enrichment->'job');
    v_added := array_append(v_added, 'job');
  END IF;
  IF p_enrichment ? 'language' OR p_enrichment ? 'langue' THEN
    v_profile := v_profile || jsonb_build_object('language', COALESCE(p_enrichment->>'language', p_enrichment->>'langue'));
    v_added := array_append(v_added, 'language');
  END IF;
  IF p_enrichment ? 'notes' OR p_enrichment ? 'notes_chatter' THEN
    v_profile := v_profile || jsonb_build_object('notes_chatter', COALESCE(p_enrichment->>'notes', p_enrichment->>'notes_chatter'));
    v_added := array_append(v_added, 'notes');
  END IF;
  IF p_enrichment ? 'relationship_status' THEN
    v_profile := v_profile || jsonb_build_object('relationship_status', p_enrichment->>'relationship_status');
    v_added := array_append(v_added, 'relationship_status');
  END IF;
  IF p_enrichment ? 'budget_range' THEN
    v_profile := v_profile || jsonb_build_object('budget_range', p_enrichment->>'budget_range');
    v_added := array_append(v_added, 'budget_range');
  END IF;
  IF p_enrichment ? 'whatsapp_phone' THEN
    v_profile := v_profile || jsonb_build_object('whatsapp_phone', p_enrichment->>'whatsapp_phone');
    v_added := array_append(v_added, 'whatsapp_phone');
  END IF;

  v_profile := v_profile || jsonb_build_object('identity', v_identity, 'location', v_location);
  v_meta    := v_meta    || jsonb_build_object('profile', v_profile);

  UPDATE public.spenders SET
    meta                = v_meta,
    first_name          = COALESCE(first_name,          NULLIF(p_enrichment->>'first_name', '')),
    age                 = COALESCE(age,                 (p_enrichment->>'age')::int),
    job                 = COALESCE(job,                  p_enrichment->>'job'),
    city                = COALESCE(city,                 p_enrichment->>'city'),
    country             = COALESCE(country,              p_enrichment->>'country'),
    langue              = COALESCE(langue,               p_enrichment->>'language', p_enrichment->>'langue'),
    notes               = COALESCE(notes,                p_enrichment->>'notes', p_enrichment->>'notes_chatter'),
    relationship_status = COALESCE(relationship_status,  p_enrichment->>'relationship_status'),
    budget_range        = COALESCE(budget_range,         p_enrichment->>'budget_range'),
    whatsapp_phone      = COALESCE(whatsapp_phone,       p_enrichment->>'whatsapp_phone'),
    updated_at          = now()
  WHERE id = p_spender_id;

  BEGIN
    INSERT INTO public.spender_events (tg_user_id, spender_id, event_type, idempotency_key, data)
    VALUES (
      v_tg_norm, p_spender_id, 'profile_updated',
      'enrich:' || p_spender_id::text || ':' || extract(epoch from now())::bigint,
      jsonb_build_object(
        'summary',    'Enrichment: ' || array_to_string(v_added, ', '),
        'fields',     to_jsonb(v_added),
        'added',      to_jsonb(v_added),
        'updated',    to_jsonb(v_updated),
        'enrichment', p_enrichment
      )
    )
    ON CONFLICT (event_type, tg_user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'spender_events insert failed (profile_updated tg=%): %', v_tg_norm, SQLERRM;
  END;

  RETURN jsonb_build_object('added', to_jsonb(v_added), 'updated', to_jsonb(v_updated));
END;
$$;

DROP FUNCTION IF EXISTS public.fn_apply_spender_enrichment(UUID, BIGINT, JSONB);
CREATE FUNCTION public.fn_apply_spender_enrichment(
  p_spender_id UUID, p_tg_user_id BIGINT, p_enrichment JSONB
)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER AS $$
  SELECT public.fn_apply_spender_enrichment(p_spender_id, p_tg_user_id::text, p_enrichment);
$$;

GRANT EXECUTE ON FUNCTION public.fn_apply_spender_enrichment(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_apply_spender_enrichment(UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_apply_spender_enrichment(UUID, BIGINT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_apply_spender_enrichment(UUID, BIGINT, JSONB) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- E) fn_insert_spender_event (TEXT) — best-effort + WHERE idempotency_key IS NOT NULL
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_insert_spender_event(
  p_tg_user_id      TEXT,
  p_event_type      TEXT,
  p_idempotency_key TEXT,
  p_data            JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  BEGIN
    INSERT INTO public.spender_events (tg_user_id, event_type, idempotency_key, data)
    VALUES (p_tg_user_id, p_event_type, p_idempotency_key, p_data)
    ON CONFLICT (event_type, tg_user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
    RETURNING id INTO v_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_insert_spender_event failed (tg=%, type=%): %', p_tg_user_id, p_event_type, SQLERRM;
    RETURN NULL;
  END;

  IF v_id IS NULL AND p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_id
      FROM public.spender_events
     WHERE event_type       = p_event_type
       AND tg_user_id::text = p_tg_user_id
       AND idempotency_key  = p_idempotency_key;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_insert_spender_event(TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_insert_spender_event(TEXT, TEXT, TEXT, JSONB) TO service_role;
