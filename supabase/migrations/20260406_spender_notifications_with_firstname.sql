-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: spender_notifications_with_firstname
-- Purpose: Trigger on spenders INSERT → create kind='spender' notifications
--          for gérant/admin/ceo + chatters assigned to the spender's model.
--          Title includes spender's real first_name when available.
-- Safe to re-run: DROP IF EXISTS + CREATE OR REPLACE
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Trigger function: fn_spender_notify_on_insert
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_spender_notify_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_display_name  TEXT;
  v_handle        TEXT;
  v_title         TEXT;
  v_message       TEXT;
  v_profile_row   RECORD;
BEGIN
  -- Build display name: prefer first_name, fallback handle/name
  v_handle       := COALESCE(NEW.handle, NEW.name, 'Inconnu');
  v_display_name := COALESCE(
    NULLIF(TRIM(NEW.first_name), ''),
    NULLIF(TRIM(NEW.handle), ''),
    NULLIF(TRIM(NEW.name), ''),
    'Inconnu'
  );

  v_title   := '👤 Nouveau spender : ' || v_display_name;
  v_message := 'Un nouveau spender (@' || v_handle || ') vient d''être ajouté.';

  -- Notify gérant / admin / ceo
  FOR v_profile_row IN
    SELECT id FROM public.profiles
    WHERE role IN ('gerant', 'admin', 'ceo')
      AND is_active IS NOT FALSE
  LOOP
    INSERT INTO public.notifications (user_id, type, kind, title, message, read, is_read)
    VALUES (v_profile_row.id, 'spender_new', 'spender', v_title, v_message, false, false)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Notify chatters whose assigned_models includes this spender's model_id
  IF NEW.model_id IS NOT NULL THEN
    FOR v_profile_row IN
      SELECT id FROM public.profiles
      WHERE role = 'chatter'
        AND is_active IS NOT FALSE
        AND assigned_models @> ARRAY[NEW.model_id]::uuid[]
    LOOP
      INSERT INTO public.notifications (user_id, type, kind, title, message, read, is_read)
      VALUES (v_profile_row.id, 'spender_new', 'spender', v_title, v_message, false, false)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Attach trigger to spenders table (INSERT only)
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_spender_notify_on_insert ON public.spenders;

CREATE TRIGGER trg_spender_notify_on_insert
  AFTER INSERT ON public.spenders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_spender_notify_on_insert();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Also trigger on spender_events INSERT with event_type = 'new_spender'
--    (for Telegram-sourced spenders that may bypass the spenders table trigger)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_spender_event_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_spender       RECORD;
  v_display_name  TEXT;
  v_handle        TEXT;
  v_title         TEXT;
  v_message       TEXT;
  v_profile_row   RECORD;
BEGIN
  -- Only fire for new_spender events
  IF NEW.event_type <> 'new_spender' THEN
    RETURN NEW;
  END IF;

  -- Fetch the spender record (matched by tg_user_id)
  SELECT handle, name, first_name, model_id
    INTO v_spender
    FROM public.spenders
   WHERE tg_user_id = NEW.tg_user_id
   LIMIT 1;

  -- Use data JSONB fallback if spender not found yet
  v_handle       := COALESCE(v_spender.handle, (NEW.data->>'handle')::TEXT, 'Inconnu');
  v_display_name := COALESCE(
    NULLIF(TRIM(v_spender.first_name), ''),
    NULLIF((NEW.data->>'first_name')::TEXT, ''),
    NULLIF(TRIM(v_spender.handle), ''),
    NULLIF((NEW.data->>'handle')::TEXT, ''),
    NULLIF(TRIM(v_spender.name), ''),
    'Inconnu'
  );

  v_title   := '👤 Nouveau spender : ' || v_display_name;
  v_message := 'Spender @' || v_handle || ' ajouté via Telegram.';

  -- Notify gérant / admin / ceo
  FOR v_profile_row IN
    SELECT id FROM public.profiles
    WHERE role IN ('gerant', 'admin', 'ceo')
      AND is_active IS NOT FALSE
  LOOP
    INSERT INTO public.notifications (user_id, type, kind, title, message, read, is_read)
    VALUES (v_profile_row.id, 'spender_new', 'spender', v_title, v_message, false, false)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Notify chatters whose assigned_models includes this spender's model_id
  IF v_spender.model_id IS NOT NULL THEN
    FOR v_profile_row IN
      SELECT id FROM public.profiles
      WHERE role = 'chatter'
        AND is_active IS NOT FALSE
        AND assigned_models @> ARRAY[v_spender.model_id]::uuid[]
    LOOP
      INSERT INTO public.notifications (user_id, type, kind, title, message, read, is_read)
      VALUES (v_profile_row.id, 'spender_new', 'spender', v_title, v_message, false, false)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_spender_event_notify ON public.spender_events;

CREATE TRIGGER trg_spender_event_notify
  AFTER INSERT ON public.spender_events
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_spender_event_notify();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Add 'spender_new' to iconMap/typeMap in case it isn't handled
--    (No SQL needed — handled in frontend iconMap)
-- ─────────────────────────────────────────────────────────────────────────────
-- Done. Both triggers are now active.
