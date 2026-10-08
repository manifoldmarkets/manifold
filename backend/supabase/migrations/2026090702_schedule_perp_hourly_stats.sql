begin;

set
  local lock_timeout = '2s';

set
  local statement_timeout = '30s';

create extension if not exists pg_cron;

-- Separate from the application scheduler and its nightly stats pipeline.
-- Reusing the job name makes applying this migration again idempotent.
select
  cron.schedule (
    'capture-perp-hourly-stats',
    '5 * * * *',
    $job$set statement_timeout = '20s'; set lock_timeout = '1s'; select public.capture_perp_hourly_stats();$job$
  );

commit;
