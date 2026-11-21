-- Progress markers for windowed scheduler jobs; see
-- migrations/2026112201_ach_trades_incremental.sql.
create table if not exists job_watermarks (
  job_name text primary key,
  watermark timestamptz not null,
  updated_time timestamptz not null default now()
);

alter table job_watermarks enable row level security;
