-- Leaderboards for the /election page (common/src/election-leaderboards.ts),
-- rebuilt by the scheduler's update-election-leaderboards job. One row per
-- board key ('2026', '2028', '2030', 'us-elections', 'us-politics') and kind
-- ('profit' or 'creator'); entries are [{ userId, score }], best first.
create table if not exists
  election_leaderboards (
    board text not null,
    kind text not null,
    entries jsonb not null,
    updated_time timestamptz not null default now(),
    primary key (board, kind)
  );

-- The scheduler writes and the API reads.
alter table election_leaderboards enable row level security;
