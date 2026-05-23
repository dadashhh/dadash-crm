-- Fix authenticated access to policies that call public.get_my_role().
-- The V1 messaging/TX policies use this helper directly; without EXECUTE,
-- manager_chatter gets "permission denied for function get_my_role".

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.role
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid())
$$;

REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO service_role;

COMMENT ON FUNCTION public.get_my_role() IS
  'Returns current profile role for RLS policies. SECURITY DEFINER avoids profiles RLS recursion.';
