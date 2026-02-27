-- ═══════════════════════════════════════════════════════════════════════════════
-- PIPELINE SPENDER ENRICHMENT — fn_upsert_spender_from_tg, fn_apply_spender_enrichment
-- Canonical flow: ingestion → resolve spender → enrich → update + event
-- ═══════════════════════════════════════════════════════════════════════════════

-- Colonnes spenders (additive)
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS job TEXT;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS langue TEXT;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS relationship_status TEXT;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS budget_range TEXT;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT;

-- ── fn_upsert_spender_from_tg (étendu: first_name, source) ───────────────────
CREATE OR REPLACE FUNCTION public.fn_upsert_spender_from_tg(
  p_tg_user_id    BIGINT,
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
  v_existing RECORD;
BEGIN
  v_handle := COALESCE(NULLIF(TRIM(p_username), ''), 'tg_' || p_tg_user_id::text);
  v_name := COALESCE(NULLIF(TRIM(p_display_name), ''), NULLIF(TRIM(p_first_name), ''), v_handle);

  SELECT id, meta INTO v_existing FROM public.spenders WHERE tg_user_id = p_tg_user_id LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    v_id := v_existing.id;
    v_meta := COALESCE(v_existing.meta, '{}'::jsonb);
    IF p_meta IS NOT NULL AND p_meta <> '{}'::jsonb THEN
      v_meta := public.jsonb_deep_merge(v_meta, p_meta);
    END IF;
    UPDATE public.spenders
    SET handle = COALESCE(NULLIF(TRIM(handle), ''), v_handle),
        display_name = COALESCE(NULLIF(TRIM(display_name), ''), NULLIF(TRIM(p_display_name), '')),
        name = COALESCE(NULLIF(TRIM(name), ''), v_name),
        first_name = COALESCE(first_name, NULLIF(TRIM(p_first_name), '')),
        telegram_username = COALESCE(telegram_username, TRIM(BOTH '@' FROM COALESCE(p_username, ''))),
        meta = v_meta,
        last_seen_at = now(),
        updated_at = now()
    WHERE id = v_id;

    INSERT INTO public.spender_events (tg_user_id, spender_id, event_type, idempotency_key, data)
    VALUES (p_tg_user_id, v_id, 'spender_enriched', 'tg:' || p_tg_user_id::text || ':sync:' || extract(epoch from now())::bigint,
      jsonb_build_object('summary', 'Spender mis à jour', 'source', p_source))
    ON CONFLICT (event_type, tg_user_id, idempotency_key) DO NOTHING;
  ELSE
    INSERT INTO public.spenders (tg_user_id, handle, name, display_name, first_name, telegram_username, meta, status, last_seen_at)
    VALUES (p_tg_user_id, v_handle, v_name, NULLIF(TRIM(p_display_name), ''), NULLIF(TRIM(p_first_name), ''),
      TRIM(BOTH '@' FROM COALESCE(p_username, '')), COALESCE(p_meta, '{}'::jsonb), 'active', now())
    RETURNING id INTO v_id;

    INSERT INTO public.spender_events (tg_user_id, spender_id, event_type, idempotency_key, data)
    VALUES (p_tg_user_id, v_id, 'new_spender', 'tg:' || p_tg_user_id::text || ':created',
      jsonb_build_object('summary', 'Nouveau spender', 'handle', v_handle, 'source', p_source))
    ON CONFLICT (event_type, tg_user_id, idempotency_key) DO NOTHING;
  END IF;
  RETURN v_id;
END;
$$;

-- Wrapper 4 args pour compat (sans first_name ni source)
DROP FUNCTION IF EXISTS public.fn_upsert_spender_from_tg(BIGINT, TEXT, TEXT, JSONB);
CREATE FUNCTION public.fn_upsert_spender_from_tg(p_tg BIGINT, p_user TEXT, p_disp TEXT, p_meta JSONB)
RETURNS UUID LANGUAGE sql SECURITY DEFINER AS $$
  SELECT public.fn_upsert_spender_from_tg(p_tg, p_user, p_disp, NULL, p_meta, 'telegram_sync');
$$;

GRANT EXECUTE ON FUNCTION public.fn_upsert_spender_from_tg(BIGINT, TEXT, TEXT, TEXT, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_upsert_spender_from_tg(BIGINT, TEXT, TEXT, TEXT, JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_upsert_spender_from_tg(BIGINT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_upsert_spender_from_tg(BIGINT, TEXT, TEXT, JSONB) TO service_role;

-- ── fn_apply_spender_enrichment ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_apply_spender_enrichment(
  p_spender_id    UUID,
  p_tg_user_id   BIGINT,
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
  v_key       TEXT;
  v_val       JSONB;
BEGIN
  IF p_enrichment IS NULL OR p_enrichment = '{}'::jsonb THEN
    RETURN jsonb_build_object('added', '[]'::jsonb, 'updated', '[]'::jsonb);
  END IF;

  SELECT meta INTO v_meta FROM public.spenders WHERE id = p_spender_id;
  IF v_meta IS NULL THEN v_meta := '{}'::jsonb; END IF;

  v_profile := COALESCE(v_meta->'profile', '{}'::jsonb);
  v_identity := COALESCE(v_profile->'identity', '{}'::jsonb);
  v_location := COALESCE(v_profile->'location', '{}'::jsonb);

  -- Merge enrichment into meta.profile
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
  v_meta := v_meta || jsonb_build_object('profile', v_profile);

  -- Update spenders: meta + colonnes top-level (COALESCE = ne pas écraser si déjà rempli)
  UPDATE public.spenders SET
    meta = v_meta,
    first_name = COALESCE(first_name, NULLIF(p_enrichment->>'first_name', '')),
    age = COALESCE(age, (p_enrichment->>'age')::int),
    job = COALESCE(job, p_enrichment->>'job'),
    city = COALESCE(city, p_enrichment->>'city'),
    country = COALESCE(country, p_enrichment->>'country'),
    langue = COALESCE(langue, p_enrichment->>'language', p_enrichment->>'langue'),
    notes = COALESCE(notes, p_enrichment->>'notes', p_enrichment->>'notes_chatter'),
    relationship_status = COALESCE(relationship_status, p_enrichment->>'relationship_status'),
    budget_range = COALESCE(budget_range, p_enrichment->>'budget_range'),
    whatsapp_phone = COALESCE(whatsapp_phone, p_enrichment->>'whatsapp_phone'),
    updated_at = now()
  WHERE id = p_spender_id;

  -- Event avec diff lisible
  INSERT INTO public.spender_events (tg_user_id, spender_id, event_type, idempotency_key, data)
  VALUES (p_tg_user_id, p_spender_id, 'profile_updated',
    'enrich:' || p_spender_id::text || ':' || extract(epoch from now())::bigint,
    jsonb_build_object(
      'summary', 'Enrichment: ' || array_to_string(v_added, ', '),
      'fields', to_jsonb(v_added),
      'added', to_jsonb(v_added),
      'updated', to_jsonb(v_updated),
      'enrichment', p_enrichment
    ))
  ON CONFLICT (event_type, tg_user_id, idempotency_key) DO NOTHING;

  RETURN jsonb_build_object('added', to_jsonb(v_added), 'updated', to_jsonb(v_updated));
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_apply_spender_enrichment(UUID, BIGINT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_apply_spender_enrichment(UUID, BIGINT, JSONB) TO service_role;

-- ── v_bot_autofill_metrics (errors_24h réel) ─────────────────────────────────
DROP VIEW IF EXISTS public.v_bot_autofill_metrics;
CREATE VIEW public.v_bot_autofill_metrics AS
SELECT
  (SELECT COUNT(*)::INTEGER FROM public.tg_messages WHERE created_at >= now() - INTERVAL '24 hours') AS msgs_24h,
  (SELECT COUNT(*)::INTEGER FROM public.spender_events WHERE event_type IN ('new_spender','spender_created') AND created_at >= now() - INTERVAL '24 hours') AS spenders_created_24h,
  (SELECT COUNT(*)::INTEGER FROM public.spender_events WHERE event_type IN ('profile_updated','enriched','spender_enriched') AND created_at >= now() - INTERVAL '24 hours') AS spenders_updated_24h,
  (SELECT COUNT(*)::INTEGER FROM public.spender_enrich_queue WHERE status IN ('queued','processing')) AS enrich_pending,
  (SELECT COUNT(*)::INTEGER FROM public.spender_enrich_queue WHERE status = 'done' AND updated_at >= now() - INTERVAL '24 hours') AS enrich_done,
  (SELECT COUNT(*)::INTEGER FROM public.spender_enrich_queue WHERE status = 'failed' AND updated_at >= now() - INTERVAL '24 hours') AS errors_24h,
  now() AS updated_at;

GRANT SELECT ON public.v_bot_autofill_metrics TO authenticated;

-- ── fn_refresh_spender_from_tg (pour bouton "Refresh from TG") ───────────────
CREATE OR REPLACE FUNCTION public.fn_refresh_spender_from_tg(p_spender_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tg      BIGINT;
  v_conv_id UUID;
  v_result  JSONB := '{}'::jsonb;
BEGIN
  SELECT tg_user_id INTO v_tg FROM public.spenders WHERE id = p_spender_id;
  IF v_tg IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'spender_not_found');
  END IF;

  SELECT id INTO v_conv_id FROM public.tg_conversations
  WHERE (tg_user_id::text = v_tg::text OR (tg_chat_id ~ '^\d+$' AND tg_chat_id = v_tg::text)) LIMIT 1;

  IF v_conv_id IS NOT NULL THEN
    PERFORM public.fn_enqueue_enrich(v_conv_id, v_tg, NULL::BIGINT);
    v_result := v_result || jsonb_build_object('enrich_queued', true);
  END IF;

  RETURN v_result || jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_refresh_spender_from_tg(UUID) TO authenticated;

-- v_spenders: fallback first_name depuis meta.profile.telegram
DROP VIEW IF EXISTS public.v_spenders;
CREATE VIEW public.v_spenders AS
SELECT
  s.id,
  s.tg_user_id,
  COALESCE(NULLIF(TRIM(s.handle), ''), s.telegram_username, s.meta->'profile'->'telegram'->>'username', CASE WHEN s.tg_user_id IS NOT NULL THEN 'tg_' || s.tg_user_id::text ELSE 'id:' || s.id::text END) AS username,
  COALESCE(NULLIF(TRIM(s.handle), ''), s.telegram_username, s.meta->'profile'->'telegram'->>'username', CASE WHEN s.tg_user_id IS NOT NULL THEN 'tg_' || s.tg_user_id::text ELSE 'id:' || s.id::text END) AS handle,
  COALESCE(NULLIF(TRIM(s.display_name), ''), NULLIF(TRIM(s.name), ''), s.meta->'profile'->'telegram'->>'display') AS display_name,
  COALESCE(NULLIF(TRIM(s.display_name), ''), NULLIF(TRIM(s.name), ''), s.meta->'profile'->'telegram'->>'display') AS name,
  COALESCE(s.first_name, s.meta->'profile'->'identity'->>'first_name', s.meta->'profile'->'telegram'->>'first_name', s.meta->'profile'->>'first_name') AS first_name,
  COALESCE(s.age, (s.meta->'profile'->'identity'->>'age')::int, (s.meta->'profile'->>'age')::int) AS age,
  COALESCE(s.job, s.meta->'profile'->>'job') AS job,
  COALESCE(s.city, s.meta->'profile'->'location'->>'city', s.meta->'profile'->>'city') AS city,
  COALESCE(s.country, s.meta->'profile'->'location'->>'country', s.meta->'profile'->>'country') AS country,
  COALESCE(s.langue, s.meta->'profile'->>'language', s.meta->'profile'->>'langue') AS language,
  COALESCE(s.notes, s.meta->'profile'->>'notes_chatter') AS notes,
  COALESCE(s.meta, '{}'::jsonb) AS meta,
  COALESCE(s.status, 'active') AS status,
  s.telegram_username,
  s.whatsapp_phone,
  s.classification,
  s.source,
  COALESCE(s.created_at, now()) AS created_at,
  COALESCE(s.updated_at, s.created_at, now()) AS updated_at,
  COALESCE(s.last_seen_at, s.updated_at, s.created_at, now()) AS last_activity_at
FROM public.spenders s;
GRANT SELECT ON public.v_spenders TO authenticated;
