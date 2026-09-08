# MNX perpetual feeds

Implementation only: no production migration, collector deployment, backfill,
market creation, or publication has been performed. The scripts below default
to read-only inspection and explicitly refuse production writes.

## Instruments and economics

The common MNX catalog defines 16 stable `mnx-<symbol>-mark` feeds: ANTHROPIC,
OPENAI, DEEPSEEK, MOONSHOT, H100, ASML, CRWV, DRAM, GOOGL, META, MINIMAX, MU,
SNDK, SPCX, TSM, and ZAI. Existing NVDAx stays unchanged; MNX NVDA is excluded.

Prices track MNX **mark prices**, never a reference/oracle fallback. The four
valuation futures remain denominated in USD billions (`2104` displays as
`$2,104B`). Each market has a permanent “Trade with real money on MNX” link
beneath its chart, alongside the MNX source credit.
Valuation futures reference the IPO/2028 terms; H100 tracks GPU rental prices.

Creation uses the larger of 10× and the integer leverage supported by MNX's
initial margin ratio. The current 16-market catalog produces 10× everywhere.
Each market receives M25,000 per side (M800,000 total), existing platform fee
defaults, funding sensitivity 1, and an hourly funding cap equivalent to 100%
nominal annually. These values are frozen on creation, not synchronized later
when MNX changes its leverage settings. The 60-second source delay exposes
backing to latency arbitrage; 10× exceeds MNX's limit on several instruments.

## Collector and recovery

`update-mnx` runs on the perps scheduler, with one `/v0/markets` request due
every 60 seconds. A Postgres advisory transaction lock spans the bounded
10-second fetch and atomic snapshot/history commit. A durable next-attempt
time prevents duplicate polling and survives restarts. Errors retain the last
successful snapshot, back off with jitter, and honor Retry-After. Nonretryable
HTTP errors wait one hour. Normal traffic is about 1,440 requests/day. Successful requests schedule the
next minute boundary; retries wait until a cron firing at or after Retry-After.

`mnx_provider_state` retains one bulk snapshot, instrument identities, retry
state and availability. Oracle observations retain raw integer strings and
original units in `oracle_prices.source_data`. Decimal placement converts the
raw string to a decimal string before the engine's one numeric conversion;
the original scaled integer is never rounded through JavaScript Number.
Published observation history is retained indefinitely under the existing
append-only policy. Storage growth is at most 16 observations/minute; repeated
source timestamps do not create rows. A newer source timestamp is recorded
even if the price is unchanged, so freshness never depends on price movement.

Provider health is applied under the same contract lock as trades. It carries
the expected price and timestamp, so a contract awaiting application of a
new mark pauses. Health and prices are independently ordered in browser
quotes. Failed price application can retry the durable observation without
manufacturing a fresh timestamp.

Application runs with at most four feeds in parallel. Health and price
transactions use a one-second lock timeout and four-second statement timeout;
price updates get one attempt per poll. A contended market retries on the next
poll while other feeds advance. These are database statement bounds, not a
deadline for the entire job.

All MNX markets require a successful provider check within five minutes.
Source timestamps also expire after five minutes, except H100's configured
24-hour ceiling. `oracle_frozen`, disabled/missing instruments, invalid values,
or identity/unit changes pause immediately upon application of that status.
MNX's own H100 frozen flag currently takes effect earlier than our 24-hour
ceiling. Neither an HTTP success nor a flat candle proves a fresh price.
Funding also checks MNX health under the contract lock and skips unavailable
periods. Recovery resumes the ordinary hourly cadence without charging skipped
periods retroactively.

Logs use the existing `[oracle-feeds]` error prefix. Monitor collector heartbeat,
provider check age, per-market source age, unavailable reasons, and application
lag. A missing/frozen instrument keeps its identity and history; inspect
`/markets/<market_id>` before resolving it. Do not silently relabel or roll it
into a replacement. Existing admin settlement remains the recovery path if
the upstream future ends. Do not insert a fabricated live price to clear a pause.

## DEV verification and later rollout

1. Apply `2026090801_mnx_feeds.sql` to the explicitly selected DEV database.
   Deploy schema before API/scheduler code that reads the provider-state table.
2. Run the DEV scheduler and verify a durable live MNX snapshot. Backend and
   Firebase environments must agree for all scripts. No MNX API key is needed.
3. From `backend/scripts`, inspect history with
   `npx ts-node backfill-mnx-oracle.ts`, optionally `--feed=mnx-anthropic-mark`.
   Add `--apply` only for DEV writes. It fetches completed hourly mark candles
   over 32 days, excludes the live-history overlap, and refuses feeds backing
   an unresolved market, including concurrent creation. No force override.
   Candle provenance remains distinct; it cannot satisfy live-feed readiness.
4. Run `npx ts-node perp-launch-preflight.ts --cohort=mnx --phase=feeds`.
   The cohort limits required launch visibility/history checks while retaining
   accounting checks for existing live markets. At least 30 days of chart
   history and a healthy live observation are required.
5. Inspect `npx ts-node create-mnx-perps.ts`. With the official DEV creator's
   API key in `MANIFOLD_API_KEY`, `--apply` creates only missing **unlisted**
   DEV markets via the authenticated creation API. The backend serializes
   creation per feed and rejects duplicates. If a request times out, stop and
   rerun inspection; never assume the create failed or blindly repeat funding.
6. Run the unlisted cohort preflight. Verify price units and links on narrow
   screens, open/close at 10×, a price move and liquidation, frozen/recovery
   transitions without price changes, and at least one hourly funding cycle.
7. A later, separately authorized production rollout must apply the migration,
   enable collection, backfill before creation, and create unlisted markets
   with the official production account. The shipped scripts deliberately
   refuse PROD writes; that guard must be deliberately revised for that work.
   Publish Anthropic/OpenAI first, then the remaining cohort. Use
   `--cohort=mnx --phase=rollout --public-feed=<id>` for the cumulative public
   subset, and `--phase=public` when all 16 are public. Existing alert-policy
   and latency-acknowledgement flags still apply.

No production operation is part of implementing or testing this change.
