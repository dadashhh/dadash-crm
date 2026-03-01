-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: sync_models_from_profiles
-- Purpose:
--   1. Insert missing rows in `models` for every profile with role='modele'
--      that doesn't already have a matching name in `models`.
--   2. Specifically ensures "Bella" (and any other new modele profile) exists
--      in the `models` table so she appears everywhere in filters/cards/assignation.
-- Safe to re-run: uses ON CONFLICT DO NOTHING / IF NOT EXISTS patterns.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Upsert all modele profiles into models table (by name, case-insensitive)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.models (name, is_active)
SELECT DISTINCT
  p.name,
  COALESCE(p.is_active, true)
FROM public.profiles p
WHERE p.role = 'modele'
  AND p.name IS NOT NULL
  AND TRIM(p.name) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.models m
    WHERE LOWER(TRIM(m.name)) = LOWER(TRIM(p.name))
  )
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Explicit safety net for "Bella" (in case profile name differs in casing)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.models (name, is_active)
SELECT 'Bella', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.models WHERE LOWER(TRIM(name)) = 'bella'
)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Create a DB trigger to auto-sync on future profile inserts/updates
--    (so we never have to run this manually again)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sync_model_on_profile_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only act when role is 'modele' and name is set
  IF NEW.role = 'modele' AND NEW.name IS NOT NULL AND TRIM(NEW.name) <> '' THEN
    -- Insert model row if not already present (case-insensitive match)
    IF NOT EXISTS (
      SELECT 1 FROM public.models
      WHERE LOWER(TRIM(name)) = LOWER(TRIM(NEW.name))
    ) THEN
      INSERT INTO public.models (name, is_active)
      VALUES (TRIM(NEW.name), COALESCE(NEW.is_active, true))
      ON CONFLICT DO NOTHING;
    END IF;

    -- On UPDATE: if name changed, rename the models row too
    IF TG_OP = 'UPDATE' AND OLD.name IS NOT NULL AND OLD.name <> NEW.name THEN
      UPDATE public.models
      SET name = TRIM(NEW.name)
      WHERE LOWER(TRIM(name)) = LOWER(TRIM(OLD.name));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_model_on_profile_insert ON public.profiles;
CREATE TRIGGER trg_sync_model_on_profile_insert
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_model_on_profile_change();

DROP TRIGGER IF EXISTS trg_sync_model_on_profile_update ON public.profiles;
CREATE TRIGGER trg_sync_model_on_profile_update
  AFTER UPDATE OF name, role, is_active ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_model_on_profile_change();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Verify result
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT name, is_active FROM public.models ORDER BY name;
