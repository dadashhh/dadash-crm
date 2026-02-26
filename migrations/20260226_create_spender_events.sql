-- Migration: create spender_events table
-- Date: 2026-02-26
-- Purpose: Fix 404 on spender_events Supabase queries; activity feed data source

create table if not exists public.spender_events (
  id            uuid primary key default gen_random_uuid(),
  tg_user_id    bigint,
  spender_id    uuid references public.spenders(id) on delete set null,
  event_type    text not null default 'unknown',
  summary       text,
  meta          jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Index for feed queries (ordered by created_at desc)
create index if not exists spender_events_created_at_idx
  on public.spender_events (created_at desc);

-- Index for tg_user_id lookups (activity feed enrichment)
create index if not exists spender_events_tg_user_id_idx
  on public.spender_events (tg_user_id)
  where tg_user_id is not null;

-- Index for spender_id lookups
create index if not exists spender_events_spender_id_idx
  on public.spender_events (spender_id)
  where spender_id is not null;

-- RLS: allow authenticated reads
alter table public.spender_events enable row level security;

create policy "spender_events_select" on public.spender_events
  for select to authenticated using (true);

create policy "spender_events_insert" on public.spender_events
  for insert to authenticated with check (true);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger spender_events_updated_at
  before update on public.spender_events
  for each row execute procedure public.set_updated_at();
