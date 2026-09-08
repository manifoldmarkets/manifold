begin;

alter table public.oracle_prices add column if not exists source_data jsonb;

-- A single durable bulk snapshot. The collector serializes requests with an
-- advisory transaction lock, and next_attempt_at survives scheduler restarts.
create table if not exists public.mnx_provider_state (
  id text primary key check (id = 'markets'),
  snapshot jsonb,
  next_attempt_at timestamptz not null default '-infinity',
  failures integer not null default 0,
  last_error text
);
alter table public.mnx_provider_state enable row level security;
-- No public policies: only the backend reads the provider payload.
insert into public.mnx_provider_state (id) values ('markets') on conflict do nothing;

commit;
