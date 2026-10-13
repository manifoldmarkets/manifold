-- Per-day active user ids for the nightly update-stats job; see
-- migrations/2026100301_daily_activity_rollup.sql for why it exists.
create table if not exists daily_user_activity (
  day date not null,
  user_id text not null,
  action_count int not null,
  primary key (day, user_id)
);

alter table daily_user_activity enable row level security;
