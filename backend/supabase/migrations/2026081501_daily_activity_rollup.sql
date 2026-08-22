begin;

-- Per-day activity rollup for the nightly `update-stats` job.
--
-- WHY THIS EXISTS
--
-- updateActivityStats needs 68 days of history every night: 7 days that it
-- writes, plus a 61-day read-only buffer, because m1 retention reaches 59 days
-- back and mau 30. Until now it re-derived all 68 days from the source tables
-- on every run — five concurrent queries scanning ~8M rows of `user_events`
-- and ~7M rows of `contract_bets` for a second time each night.
--
-- That is what has been failing. The job died at exactly +60:00 (the client
-- `query_timeout` in shared/supabase/init.ts) every night from 2026-08-04, and
-- again on 2026-08-15 after PR #3990 had already cut the wire payload 249x —
-- because the payload was never the constraint. The scan was. Measured on
-- prod: the same query over the same rows takes 593 ms warm and 17,670 ms
-- cold, and the job runs at 11:20 UTC inside a five-hour batch train whose
-- other members (update-league re-reads every season bet every 15 minutes)
-- evict its pages continuously. Three identical chunk queries issued
-- concurrently: one succeeded, two timed out. Issued serially: all three
-- succeeded. The failure is buffer-cache eviction, so the durable fix is to
-- stop re-reading the same 68 days — not to read them faster.
--
-- With these tables the job rebuilds only the days it actually writes and
-- reads the rest of the window from here: ~650 rows/day instead of ~220k.
--
-- WHAT IS STORED
--
-- Only what daily_stats cannot already answer. Counts that are stored per day
-- (dau, bet_count, ...) are derivable, but the per-day SET of active user ids
-- is not, and wau/mau/d1/w1/m1/engaged_users are all set operations over
-- trailing windows. That set is the one thing that has to be materialized.
create table if not exists daily_user_activity (
  -- The America/Los_Angeles calendar day, matching daily_stats.start_date.
  day date not null,
  user_id text not null,
  -- Bets + markets created + comments + user-initiated perp trades, summed.
  -- The consumer takes median(counts > 1) for avg_user_actions and otherwise
  -- only cares that the user appears, so the four sources do not need to be
  -- kept apart. Always >= 1: a row exists only because the user did something.
  action_count int not null,
  primary key (day, user_id)
);

-- Per-day scalars, and the completeness marker for the rollup.
--
-- The marker role is load-bearing: a day with no row here has never been
-- computed, whereas a day with a row and no daily_user_activity rows was
-- computed and nobody was active. Gap-filling and the contiguity check both
-- depend on being able to tell those apart, which is why this table gets a row
-- for every processed day even when every count is zero.
create table if not exists daily_activity_totals (
  day date primary key,
  bet_count int not null,
  -- numeric, not float8: contract_bets.amount is numeric and the existing code
  -- path sums in numeric then casts once. Storing numeric reproduces that
  -- arithmetic exactly rather than rounding twice.
  mana_amount numeric not null,
  contract_count int not null,
  comment_count int not null,
  -- count(distinct data->>'deviceId') over user_events; feeds dav/wav/mav.
  viewer_count int not null,
  computed_at timestamptz not null default now()
);

comment on table daily_user_activity is
  'Per-day active user ids with action counts; the input to dau/wau/mau/retention/engaged_users in the update-stats job';
comment on table daily_activity_totals is
  'Per-day scalar rollups for update-stats; presence of a row means the day has been computed';

-- No index beyond the primary keys. (day, user_id) is day-leading, so the
-- window read is a range seek, and the whole rollup is ~15 MB/year.

-- RLS on with no policy: deny-all for anon and authenticated, matching every
-- other table in the public schema. Nothing client-side reads this — the
-- scheduler connects over createSupabaseDirectClient() as postgres and bypasses
-- RLS, and /stats renders daily_stats, not the rollup.
alter table daily_user_activity enable row level security;
alter table daily_activity_totals enable row level security;

commit;
