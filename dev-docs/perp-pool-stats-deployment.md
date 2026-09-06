# Deploying PERP pool stats

Apply the database migrations before deploying the stats API:

1. `backend/supabase/migrations/2026090401_add_perp_pool_events.sql`
2. `backend/supabase/migrations/2026090601_capture_perp_pool_snapshots.sql`
3. Deploy API, scheduler, and perps scheduler from the reviewed commit.
4. Deploy the web app and open `/stats?tab=perps`.

Skip migrations already applied. The second migration briefly locks contracts
while it installs database capture and records the starting balances. Once it
commits, every pool change is recorded, including changes from older API or
scheduler instances during a rolling deployment. No trading pause is needed
between applying this migration and deploying the application.

The chart shows end-of-day long/short backing, with the current day's latest
balance as its final point. It starts at database capture, with an immediate
starting balance, and grows as activity occurs. Earlier long/short balances
cannot be reconstructed reliably. The original application-only baseline is
retained for audit but is not used to imply continuous history before database
capture. Lifetime deposits, fees, and payouts still use the complete cash
transaction history.

The charts, totals, and market table cover currently listed, non-deleted PERPs,
including resolved ones. Unlisting a market removes it from those totals;
listing it includes the history recorded while it was unlisted.

Run `perp-launch-preflight.ts` to verify the snapshot index and capture trigger.
The stats page regenerates hourly, so allow for its cache or explicitly
revalidate `/stats` after deploying the API and web app.

## Regression tests

The integration tests require PostgreSQL and run in their own schema inside a
disposable local database named `perp_stats_test`. They reject remote databases.

```sh
docker run --rm -d --name perp-stats-test \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=perp_stats_test \
  -p 127.0.0.1:55437:5432 postgres:15-alpine
PERP_POOL_STATS_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55437/perp_stats_test \
  yarn --cwd=backend/shared test --runInBand pool-stats.test.ts
docker stop perp-stats-test
```
