-- Manually maintained blocklist used to prevent account creation
-- and to seed future autoban decisions.
create table if not exists signup_blocklist (
  id bigint generated always as identity primary key,
  entry_type text not null check (entry_type in ('ip', 'device_token')),
  value text not null,
  reason text,
  source_user_id text references users (id),
  created_at timestamptz not null default now()
);

create index if not exists idx_signup_blocklist_lookup
  on signup_blocklist (entry_type, value);

alter table signup_blocklist enable row level security;
