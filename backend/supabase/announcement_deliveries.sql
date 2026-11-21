-- Progress of each announcement post's send to every user; see
-- migrations/2026112201_announcement_deliveries.sql.
create table if not exists announcement_deliveries (
  post_id text primary key,
  created_time timestamptz not null default now(),
  last_user_id text,
  sent_count int not null default 0,
  finished_time timestamptz,
  updated_time timestamptz not null default now(),
  last_error text,
  skip_existing boolean not null default false
);

alter table announcement_deliveries enable row level security;

-- Indexes
create index if not exists announcement_deliveries_unfinished
  on announcement_deliveries (updated_time)
  where finished_time is null;
