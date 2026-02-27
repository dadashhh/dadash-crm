-- merge_spender_profile(p_tg_user_id, p_patch, p_source) → void
-- Resolves spender (auto-create if needed), then deep-merges p_patch
-- into spenders.meta.profile. Idempotent, last-write-wins per key.

create or replace function public.merge_spender_profile(
  p_tg_user_id text,
  p_patch jsonb,
  p_source text default 'bot'
) returns void
language plpgsql
security definer
as $$
declare v_id uuid;
begin
  v_id := public.resolve_spender_by_tg_user_id(p_tg_user_id);

  update public.spenders
  set meta =
    jsonb_set(
      coalesce(meta, '{}'::jsonb),
      '{profile}',
      coalesce(meta -> 'profile', '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb),
      true
    )
    || jsonb_build_object(
      'last_enrich_source', p_source,
      'last_enrich_at', to_jsonb(now())
    ),
    updated_at = now()
  where id = v_id;
end;
$$;
