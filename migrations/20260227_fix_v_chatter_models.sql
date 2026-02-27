-- FIX: v_chatter_models — DROP + recreate to handle column type change
-- Error was: "cannot change data type of view column model_id from uuid to text"
-- Root cause: profiles.assigned_models may be text[] or jsonb depending on migrations applied.
-- This migration handles BOTH cases safely.

-- Step 1: DROP existing view (cannot ALTER column types with CREATE OR REPLACE)
DROP VIEW IF EXISTS public.v_chatter_models;

-- Step 2: Detect column type and recreate accordingly
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
    RAISE NOTICE 'Column profiles.assigned_models does not exist — skipping view creation';
    RETURN;
  END IF;

  IF col_type = 'ARRAY' OR col_type = 'text[]' OR col_type LIKE '%[]%' THEN
    -- assigned_models is text[] — use unnest, cast to text (model_id is text)
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
    RAISE NOTICE 'v_chatter_models created for text[] column (model_id as text)';

  ELSIF col_type = 'jsonb' THEN
    -- assigned_models is jsonb — use jsonb_array_elements_text
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
    RAISE NOTICE 'v_chatter_models created for jsonb column (model_id as text)';

  ELSE
    -- Fallback: try text[] approach
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
    RAISE NOTICE 'v_chatter_models created with fallback approach (col_type=%), model_id as text', col_type;
  END IF;
END
$$;

-- Step 3: Grant permissions
GRANT SELECT ON public.v_chatter_models TO authenticated, service_role;

-- Step 4: Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'v_chatter_models'
ORDER BY ordinal_position;
