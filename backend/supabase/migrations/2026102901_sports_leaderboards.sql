-- Leaderboards for the sports pages (common/src/sports-leaderboards.ts),
-- rebuilt by the scheduler's update-sports-leaderboards job. One row per sport
-- key ('all' for every sports market) and kind ('profit' or 'creator');
-- entries are [{ userId, score }], best first.
create table if not exists
  sports_leaderboards (
    sport text not null,
    kind text not null,
    entries jsonb not null,
    updated_time timestamptz not null default now(),
    primary key (sport, kind)
  );

-- The scheduler writes and the API reads.
alter table sports_leaderboards enable row level security;
