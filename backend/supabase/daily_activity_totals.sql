-- Per-day scalar rollups for the nightly update-stats job. A row's presence
-- means the day has been computed; see
-- migrations/2026100301_daily_activity_rollup.sql.
create table if not exists daily_activity_totals (
  day date primary key,
  bet_count int not null,
  mana_amount numeric not null,
  contract_count int not null,
  comment_count int not null,
  viewer_count int not null,
  computed_at timestamptz not null default now()
);

alter table daily_activity_totals enable row level security;
