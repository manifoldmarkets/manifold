-- Tables for the incremental update-ach-trades job
-- (backend/scheduler/src/jobs/update-ach-trades.ts). Both start empty; the
-- job's first run creates its watermark row.

-- Progress markers for scheduler jobs that fold an append-only table into a
-- rollup one time window at a time. A job stores the end of the last window it
-- applied, in the same transaction as that window's writes, so a crash or a
-- concurrent run can neither skip a window nor apply one twice.
create table if not exists job_watermarks (
  job_name text primary key,
  -- Everything at or before this instant has been applied.
  watermark timestamptz not null,
  updated_time timestamptz not null default now()
);

-- Limit orders that were still open when update-ach-trades applied their
-- window. The job counts each one into ach_trades once it fills, and forgets
-- it if it is cancelled or still open 30 days after it was placed.
create table if not exists ach_trades_open_orders (
  bet_id text primary key,
  created_time timestamptz not null
);

-- Only the scheduler reads and writes them.
alter table job_watermarks enable row level security;

alter table ach_trades_open_orders enable row level security;
