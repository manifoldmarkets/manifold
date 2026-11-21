-- Progress markers for scheduler jobs that fold an append-only table into a
-- rollup one time window at a time. A job stores the end of the last window it
-- applied, in the same transaction as that window's writes, so a crash or a
-- concurrent run can neither skip a window nor apply one twice.
--
-- First user: update-ach-trades (backend/scheduler/src/jobs/update-ach-trades.ts),
-- which adds contract_bets rows to ach_trades in created_time windows. Its row
-- is created by the job's first run, so this migration inserts nothing.
create table if not exists job_watermarks (
  job_name text primary key,
  -- Everything at or before this instant has been applied.
  watermark timestamptz not null,
  updated_time timestamptz not null default now()
);

-- Only the scheduler reads and writes it.
alter table job_watermarks enable row level security;
