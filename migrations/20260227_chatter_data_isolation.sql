-- PR1: Chatter Data Isolation
-- Creates v_chatter_models canonical view from profiles.assigned_models (text[] array).
-- No new table needed: assignments already live in profiles.assigned_models.

CREATE OR REPLACE VIEW public.v_chatter_models AS
SELECT
  p.id AS chatter_user_id,
  m.value::uuid AS model_id
FROM public.profiles p,
  unnest(p.assigned_models) m(value)
WHERE p.role = 'chatter'
  AND p.is_active IS NOT FALSE
  AND p.assigned_models IS NOT NULL
  AND array_length(p.assigned_models, 1) > 0;

GRANT SELECT ON public.v_chatter_models TO authenticated, service_role;

-- Verification queries (replace <CHATTER_UUID> with an actual chatter user ID):
-- SELECT * FROM public.v_chatter_models WHERE chatter_user_id = '<CHATTER_UUID>' LIMIT 50;
-- SELECT count(*) FROM public.transactions WHERE chatter_id = '<CHATTER_UUID>';
