-- Spender Events — activity log for the Spenders page activity feed
-- Run BEFORE using the activity feed (the UI has a fallback if this table is missing)

create extension if not exists pgcrypto;

create table if not exists public.spender_events (
  id uuid primary key default gen_random_uuid(),
  spender_id uuid,
  spender_tg_user_id text,
  spender_handle text,
  event_type text not null,
  message text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists spender_events_time_idx
  on public.spender_events(created_at desc);

create index if not exists spender_events_spender_idx
  on public.spender_events(spender_id, created_at desc);

-- Optional: seed test data
insert into public.spender_events (event_type, message, spender_handle)
values
  ('spender_created', '@Mike — nouveau spender', '@Mike'),
  ('status_changed', '@Fabri — status → VIP', '@Fabri'),
  ('tx_created', '@Mike — total dépensé +70CHF', '@Mike'),
  ('handle_set', '@Lucas — handle ajouté', '@Lucas');
