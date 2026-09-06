# PERP house liquidity stats

House liquidity at mark is total pool backing minus the marked value of all
open trader positions, before any future ADL. Trader deposits therefore do not
appear as extra house money. A negative value is retained as a risk signal.
Subsidy P&L also includes resolved residuals and subtracts deposited subsidy.

## Recording and deployment

Apply these migrations in order before deploying the API/web changes:

1. `backend/supabase/migrations/2026090701_add_perp_hourly_stats.sql`
2. `backend/supabase/migrations/2026090702_schedule_perp_hourly_stats.sql`

Both were applied to production on September 6, 2026. The first current capture
was at 18:24:51 UTC. The database job `capture-perp-hourly-stats` runs at minute
5 of every hour, independently of the application scheduler and nightly stats
pipeline. Migration 1 also imports existing funding observations and captures
current balances immediately. Reapplying either migration is safe.

The earlier proposed pool-event and trigger migrations were never applied to
production and have been removed from this PR. Do not deploy an earlier PR
commit that expects those tables. A development database that installed those
earlier migrations needs its `contract_perp_pool_snapshot` trigger disabled
separately; the hourly implementation does not use it.

Each capture reads current contract balances and positions in one statement and
writes one row per non-deleted perp per UTC hour. Retries update the same hour.
Unlisted markets are recorded so a later listing has history; API results and
public table access include only currently listed, non-deleted markets.
Resolved markets remain included, with zero remaining backing after resolution.
No new stats logging or triggers run inside trading transactions.

The capture query uses the same per-position valuation as
`common/src/perps/amm.ts`. Its SQL equivalent is covered by PostgreSQL integration
tests. Update both if the valuation formula changes. The scheduled command has
a 20-second statement timeout and a 1-second lock timeout.

Production's initial read-only measurement took about 16 ms for 13 perps and
369 joined position rows. This is a point-in-time measurement, not a latency
guarantee. At 13 perps the recorder retains 312 rows/day, about 114,000/year.

Deploy API and web from the updated PR to show `/stats?tab=perps`. Recording
already works with existing application versions. The API caches for five
minutes and the page regenerates hourly; revalidate `/stats` for an immediate
refresh after deployment. Charts use each LA day's last observation.

## Backfill

The first migration imported 2,697 older hourly funding observations, starting
August 6, 2026 for Bitcoin. Coverage varies by market and funding cadence.
These are observed total balances, not a reconstruction of every intraday move.

The production house-value backfill saved 2,665 of those 2,697 observations.
The remaining 32 are Bitcoin's earliest observations (August 6 through
August 7 at 10:00 UTC); their position history could not be replayed reliably.
All other imported observations have reconstructed house values. Backfill
uses main's partial-close support as well as funding, liquidation and ADL replay.

Run the following script using the intended environment's usual script setup:

```sh
yarn --cwd backend/scripts ts-node backfill-perp-house-stats.ts
yarn --cwd backend/scripts ts-node backfill-perp-house-stats.ts --write
```

The default is a dry run. Per contract, it reads positions, existing position
events and unfilled historical snapshots in one database statement. It reuses
the period-metric reverse replay to reconstruct claims at the recorded funding
mark. The cutoff includes the funding transition's application time where
available. Legacy effective timestamps and oracle/application timing mean
these house values are estimates, not exact settlement quotes.

Incomplete/inconsistent position history leaves house value null. The script
never overwrites live captures or previously filled house values. Repeating it
is safe. Historical work is performed once, not on page requests or hourly
captures. Missing days are not filled by carrying forward stale balances;
sitewide totals require coverage for every eligible market existing that day.

## Monitor and stop

```sql
select
  jobname,
  schedule,
  active
from
  cron.job
where
  jobname = 'capture-perp-hourly-stats';

select
  status,
  return_message,
  start_time,
  end_time
from
  cron.job_run_details
where
  jobid = (
    select
      jobid
    from
      cron.job
    where
      jobname = 'capture-perp-hourly-stats'
  )
order by
  start_time desc
limit
  10;

select
  contract_id,
  max(captured_at)
from
  contract_perp_hourly_stats
where
  source = 'snapshot'
group by
  contract_id;
```

The page shows capture time and marks it overdue after two hours. To stop
recording without deleting data:

```sql
select
  cron.unschedule ('capture-perp-hourly-stats');
```

Disable/hide the chart if abandoning the feature. Rolling back API/web alone
does not stop the independent database job. To resume, reapply migration 2 and
run `select capture_perp_hourly_stats();`. Downtime creates gaps; it cannot be
recovered automatically unless the existing funding observations cover it.

## Regression tests

Tests run in a unique schema in a disposable local database and reject remote
database URLs:

```sh
docker run --rm -d --name perp-stats-test \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=perp_stats_test \
  -p 127.0.0.1:55437:5432 postgres:15-alpine
PERP_POOL_STATS_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55437/perp_stats_test \
  yarn --cwd backend/shared test --runInBand pool-stats.test.ts
yarn --cwd common test --runInBand metric-periods.test.ts amm.test.ts escrow.test.ts
docker stop perp-stats-test
```
