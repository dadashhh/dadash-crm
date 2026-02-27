-- PR1: Chatter Data Isolation
-- Creates v_chatter_models canonical view from profiles.assigned_models.
-- IMPORTANT: DROP first to avoid "cannot change data type" error on re-run.
-- Handles both text[] and jsonb column types.

DROP VIEW IF EXISTS public.v_chatter_models;

DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'assigned_models';

  IF col_type IS NULL THEN
    RAISE NOTICE 'Column profiles.assigned_models does not exist — skipping';
    RETURN;
  END IF;

  IF col_type = 'ARRAY' OR col_type LIKE '%[]%' THEN
    EXECUTE '
      CREATE VIEW public.v_chatter_models AS
      SELECT
        p.id AS chatter_user_id,
        m.value AS model_id
      FROM public.profiles p,
        unnest(p.assigned_models) AS m(value)
      WHERE p.role = ''chatter''
        AND p.is_active IS NOT FALSE
        AND p.assigned_models IS NOT NULL
        AND array_length(p.assigned_models, 1) > 0
    ';
  ELSIF col_type = 'jsonb' THEN
    EXECUTE '
      CREATE VIEW public.v_chatter_models AS
      SELECT
        p.id AS chatter_user_id,
        elem AS model_id
      FROM public.profiles p,
        jsonb_array_elements_text(p.assigned_models) AS elem
      WHERE p.role = ''chatter''
        AND p.is_active IS NOT FALSE
        AND p.assigned_models IS NOT NULL
        AND jsonb_array_length(p.assigned_models) > 0
    ';
  ELSE
    EXECUTE '
      CREATE VIEW public.v_chatter_models AS
      SELECT
        p.id AS chatter_user_id,
        m.value AS model_id
      FROM public.profiles p,
        unnest(p.assigned_models) AS m(value)
      WHERE p.role = ''chatter''
        AND p.is_active IS NOT FALSE
        AND p.assigned_models IS NOT NULL
    ';
  END IF;
END
$$;

GRANT SELECT ON public.v_chatter_models TO authenticated, service_role;

-- Verification:
-- SELECT * FROM public.v_chatter_models LIMIT 20;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'v_chatter_models';
