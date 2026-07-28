# ManiPerp Perpetual Futures

This folder contains the backend engine for the ManiPerp perpetual futures
market type. The compiled default is gated by `PERPS_ENABLED` in
`common/src/envs/constants.ts`; API incidents use `PERP_TRADING_MODE` as
described below.

The code is intentionally self-contained so the feature is easy to remove if we
decide to sunset perps. Nothing under `backend/shared/src/perps/` is imported by
the existing CPMM / multi / numeric code paths; integration points are narrow and
explicit (see "Integration points" below).

## Files

- `engine.ts` — the authoritative entry point. Exports:

  - `openOrAddPosition(contractId, userId, direction, mana, leverage, idempotencyKey?)`
    — opens a new position or adds to an existing same-side position. An opposite-side
    position is closed atomically before the new side opens. Returns
    `{ position, event, isNewUniqueBettor }`.
  - `closePosition(contractId, userId, direction, idempotencyKey?, expectedOpenedTime?)`
    — closes a user's position at the current oracle price, credits/debits mana, and
    writes a `close` event. The optional opening timestamp prevents a stale client
    from closing a replacement position. Receipt/event `pnl` is settlement payout
    minus original deposited margin, so it includes funding; `pricePnl` preserves
    the paper's price-only π for diagnostics.
  - `runOracleUpdate(contract)` — applies liquidations + ADL at the latest oracle
    price. Called by the hourly scheduler.
  - `runFunding(contract)` — applies one funding period to all open positions.
    Called by the hourly scheduler.
  - `resolvePerp(contractId, resolverId)` — settles every open position at the
    current oracle price and returns remaining pool balances to the creator.
    The API continuation then broadcasts the resolved contract and metrics,
    refreshes both the market and embed pages, records the edit/analytics event,
    and sends ordinary resolution notifications using each final position's
    margin and payout (not lifetime market turnover).

  Every mutating call acquires a `pg_advisory_xact_lock` keyed on the contract id
  so per-contract state transitions are serialized.

- `queries.ts` — small SQL helpers used by `engine.ts` to keep the engine focused
  on state transitions rather than SQL construction. Row ↔ object converters live
  here too (e.g. `rowToPosition`).

- `user-contract-metrics.ts` — rebuilds `user_contract_metrics` rows for a perp
  contract from its events + positions. The engine is the authoritative writer
  for current/lifetime fields; engine upserts preserve the period-history block.
- `user-contract-metric-periods.ts` — reads one repeatable database snapshot and
  derives day/week/month `ContractMetric.from` values by reversing recent
  append-only events from authoritative current positions. The period job
  patches only `from`, so it cannot overwrite a concurrent trade or funding
  update.

## Pure math

All pure math (funding, liquidation, ADL, entry/exit accounting) lives in
`common/src/perps/amm.ts` and is unit-testable without a database. Formulas come
from the ManiPerp paper; see `PerpContract.data` for parameter knobs.

## API surface

Endpoints are registered in `backend/api/src/routes.ts` and schemas live in
`common/src/api/schema.ts`:

- `POST /create-perp` (admin) — creates a new perp market. Launch-manifest
  feeds automatically receive their environment-specific required topic; the
  admin form defaults to unlisted and can apply the full reviewed launch
  recommendation in one click. Launch feeds require the environment's official
  Manifold creator account because residual backing returns to the creator.
  New markets preserve their per-side initial backing for later preflight
  auditing.
- `POST /place-perp-trade` — opens or adds to a position.
- `POST /close-perp-position` — closes a position.
- `GET /get-perp-positions` — reads open positions for a contract (optionally
  filtered by `userId`).
- `GET /get-oracle-price`, `/get-oracle-price-series` — read oracle data.
- `GET /get-known-oracle-feeds` (admin) — autocomplete for the admin create page.
- `POST /internal-write-oracle-price` (admin-authed, intended for bots) — writes a
  single `(feed_id, ts, price)` row idempotently.

The web client sends a 10-character `idempotencyKey` with each open/add/flip or
close. The key, request, and response snapshot are stored on the append-only
event, and partial unique indexes ensure a retry cannot apply the balance
mutation twice. API callers should reuse the same key after an ambiguous
network failure and generate a new key only for a genuinely new action.

## Cash backing

The M$ transaction ledger is the cash source of truth, while `poolLong` and
`poolShort` describe how that cash is allocated between sides. Every
cash-moving engine transition checks, before and after mutation:

`net M$ txns into the contract = poolLong + poolShort`

Only sub-millimana floating-point dust is tolerated. Creation, open/flip,
close, factor-zero ADL, funding, and resolution fail atomically if the ledger
and pools diverge. This is required because the generic transaction primitive
does not maintain a balance column for `CONTRACT` senders.

## Exposure capacity

Opening, adding, or flipping into a side is limited so aggregate open notional
on that side cannot exceed 10× its unreserved opposing-pool cover. Unreserved
cover is the opposing pool minus each opposite-side position's currently
refundable value (capped at its cost basis), matching the reserve definition
used by ADL solvency:

`side open interest <= 10 × max(opposing pool - opposing reserves, 0)`

This is a launch guardrail in addition to the ManiPerp paper. It preserves high
leverage for small positions while preventing a new, initially flat position
from creating unlimited future claims against finite backing. The cap applies
only to exposure-increasing actions; users can always reduce or close existing
positions. Funding, oracle movement, or legacy state can move a side above the
limit, in which case further opens are blocked until capacity recovers.

## Oracle feeds

`backend/shared/src/oracle-feeds.ts` is the registry of known feeds: cadence
(`fast` | `daily`), sanity bounds, jump guard, staleness threshold, and the
required `marketCreationEnabled` capability. Setting that capability to `false`
keeps ingestion, scheduler health checks, and existing-contract updates running
while both `create-perp` and the admin picker block new markets. Feed adapters
live next to it:

- `btc-price.ts` — BTC/USD spot, median of Coinbase/Kraken/Bitstamp (all
  US-accessible; Binance geo-blocks US IPs).
- `uk-grid-carbon.ts` — GB grid carbon intensity (gCO2/kWh), NESO 30-min
  actuals.
- `eci.ts` — Epoch Capabilities Index frontier (max ECI over released
  models), parsed from Epoch's benchmark data zip (CC-BY — credit Epoch in
  market descriptions).
- `trump-approval.ts` — 14-day rolling approval average (VoteHub).
- `openrouter-tokens.ts` — trailing seven-day open-weight share of classified
  top-50 OpenRouter model traffic.

**ECI launch exclusion:** ECI remains a runtime/history feed, but its registry
entry has `marketCreationEnabled: false`. The frontier is monotone
non-decreasing, so it produces a structurally one-sided perp with pinned
funding and no sound short thesis. Do not launch an ECI market.

Backfill scripts
(`backend/scripts/backfill-{btc,uk-carbon,trump-approval,openrouter}-oracle.ts`)
seed chart history before market creation. ECI's separate retained-history
backfill is not part of the launch batch.

The executable launch set, conservative initial parameters, feed-specific game
design notes, and oracle-latency risks live in
`backend/shared/src/perps/launch-manifest.ts`. Run
`backend/scripts/perp-launch-preflight.ts` at each rollout phase; the operational
sequence and rollback are in `perps-launch-runbook.md`.

## Scheduler

- `update-oracle-feeds.ts` runs **every 15 seconds** (croner handles
  sub-minute fine — see the existing `sports-live` job). It fetches `fast`
  feeds, validates points against the registry, writes `oracle_prices`, and
  applies `runOracleUpdate` to live perps on those feeds. Liquidation + ADL
  always run in the same transaction as the price write — never add a
  price-only update path; closes settle against the cached price.
- `update-perps.ts` runs hourly: oracle updates for `daily`-feed contracts
  (a cheap no-op for fast-feed contracts thanks to the engine's no-change
  fast path), `runFunding` for all, and stale-feed alerting for any live
  contract. The once-per-`FUNDING_PERIOD_MS` funding gate lives INSIDE
  `runFunding`, under the advisory lock, so overlapping ticks can't
  double-fund.
- `update-trump-approval.ts` writes one daily point.
- `update-openrouter-share.ts` polls hourly. OpenRouter currently returns
  complete UTC days, so most hourly observations repeat the same underlying
  value; a fresh timestamp proves job liveness but does not create intraday
  price discovery.
- `update-eci.ts` remains scheduled for retained history/runtime use only.

Feed-health alerts are `log.error` lines prefixed `[oracle-feeds]` /
`[update-perps]` — wire GCP log-based alerting to those.

Trading and closes share `getOracleFreshness` from
`common/src/perps/oracle.ts`. A stale price, missing timestamp, or invalid
freshness limit pauses both paths until a valid update arrives; the market page
uses the same predicate to show the pause and disable open/close actions.

The API reads `PERP_TRADING_MODE` on each request:

- `enabled` permits creation, opens, adds, flips, and closes;
- `reduce-only` blocks creation and exposure increases while preserving closes;
- `halted` blocks all user-initiated PERP trading, including closes.

An absent value is `enabled` only when the compiled `PERPS_ENABLED` switch is
true. A false compiled switch cannot be overridden at runtime and remains at
least `reduce-only`; `halted` can tighten it further. An invalid value fails
closed as `halted`. Changing a deployed service's environment requires rolling
its instances. Liquidation, funding, and resolution deliberately remain active
in both incident modes. Use `reduce-only` for ordinary incidents and stale
feeds; use `halted` before investigating a known-corrupt but still-fresh cached
point, because unlisting alone does not block direct API calls.

Oracle rows distinguish the feed-effective `ts`, optional provider
`source_ts`, and immutable Manifold `published_at`. PERP events similarly
distinguish their effective/oracle `ts` from `applied_ts`, the time Manifold
applied the accounting transition. Period metrics use publication/application
time to avoid assigning delayed source data to an earlier reporting period.

## Period metrics

`common/src/perps/metric-periods.ts` is the pure accounting implementation.
For each day/week/month boundary it reverses at most 30 days of events and
calculates:

`period P&L = current value + realized payouts - boundary value - new margin`

The replay covers adds at weighted entry prices, funding, flips, liquidation,
partial and terminal ADL, and settlement. It fails closed on missing prices or
inconsistent history. `profitPercent` divides by boundary value plus new
margin; it is a sorting/reporting return, not a time-weighted return across
capital recycling.

The database event and oracle histories are immutable because changing either
would rewrite reported returns. Legacy rows receive the only defensible
timestamp backfill (`ts`); launch markets must be recreated after the migration
for reliable application/publication timestamps from inception.

Boundary value uses the newest feed-effective oracle point that Manifold had
published by the cutoff; current value uses the contract's cached oracle mark.
The boundary rule is deterministic, but it is not a claim that every contract
had already applied that point: feed publication and per-contract fan-out are
separate transactions and one contract can briefly lag or fail. If reporting
ever needs the historically executable contract price instead, persist
per-contract oracle-application history and value from that record.

## Integration points (grep for these to find everything)

- `outcomeType === 'PERP'` — UI switch branches.
- `contract.mechanism === 'perp'` — backend branches.
- `PERPS_ENABLED` / `PERP_TRADING_MODE` — compiled default and API incident
  control.

The touched files outside this folder are:

- `common/src/contract.ts` — adds the `PERP` outcome and `perp` mechanism.
- `common/src/api/{schema,market-types}.ts` — registers perp endpoints.
- `common/src/calculate-metrics.ts` — pass-through branch (engine is authoritative).
- `common/src/user-notification-preferences.ts`, `notification.ts` — new notif types.
- `backend/api/src/{resolve-market,unresolve}.ts` — perp resolve/block unresolve.
- `backend/api/src/{get-market-loan-max,get-free-loan-available,claim-free-loan,request-loan,get-next-loan-amount}.ts`
  — exclude perps from loans.
- `backend/shared/src/update-user-portfolio-histories-core.ts` — perp PnL branch.
- `backend/shared/src/update-user-metric-periods.ts` — event-based PERP day/week/month
  replay and race-safe `from` updates.
- `backend/shared/src/send-market-movement-notifications.ts` — exclude perps.
- `backend/shared/src/importance-score.ts` — perp scoring branch.
- `backend/scheduler/src/jobs/index.ts`, `update-perps.ts` — schedule wiring.
- `backend/scheduler/src/jobs/update-league.ts` — intentionally excludes PERP
  position P&L from league scoring for launch.
- `web/components/contract/{contract-overview,contracts-table,feed-contract-card}.tsx`,
  `web/components/perps/*`, `web/components/search.tsx`,
  `web/pages/admin/create-perp.tsx` — frontend surface.

PERPs participate in ordinary importance/freshness ranking through committed
24-hour margin volume and distinct recent traders. Daily-movers ranking uses
the absolute 24-hour oracle log return, which is comparable across feeds with
different units. Funding imbalance is not treated as movement, so a flat,
one-sided market does not remain artificially elevated.

## Removal checklist

1. Set `PERP_TRADING_MODE=reduce-only` and roll API instances to reject new
   trades; use `halted` if closes must also stop.
2. Resolve all remaining perp contracts (creator / mod flow settles at oracle).
3. Delete this folder, `common/src/perps/`, `web/components/perps/`,
   `web/pages/admin/create-perp.tsx`.
4. Remove the integration branches listed above (each is flagged with
   `PERP` / `'perp'` for easy grep).
5. Drop the tables created by `backend/supabase/migrations/2026042201_add_perps.sql`:
   `oracle_prices`, `contract_perp_positions`, `contract_perp_events`,
   `contract_perp_funding_events`.
