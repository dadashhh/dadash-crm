-- resolve_spender_by_tg_user_id(p_tg_user_id text) → uuid
-- Normalise tg_user_id (strip prefix + non-digits), lookup in spenders,
-- auto-create minimal row if absent. Idempotent, zero duplicates.

create or replace function public.resolve_spender_by_tg_user_id(p_tg_user_id text)
returns uuid
language plpgsql
security definer
as $$
declare v_id uuid;
begin
  p_tg_user_id := regexp_replace(coalesce(p_tg_user_id,''), '[^0-9]', '', 'g');
  if p_tg_user_id = '' then raise exception 'tg_user_id required'; end if;

  select id into v_id
  from public.spenders
  where tg_user_id::text = p_tg_user_id
  limit 1;

  if v_id is not null then return v_id; end if;

  insert into public.spenders (tg_user_id, meta, created_at, updated_at)
  values (p_tg_user_id, '{}'::jsonb, now(), now())
  returning id into v_id;

  return v_id;
end;
$$;

create index if not exists idx_spenders_tg_user_id_text
  on public.spenders ((tg_user_id::text));
