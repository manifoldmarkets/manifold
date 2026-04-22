# ManiPerp Perpetual Futures

This folder contains the backend engine for the ManiPerp perpetual futures market
type. Perps are gated behind the `PERPS_ENABLED` flag in `common/src/envs/constants.ts`.

The code is intentionally self-contained so the feature is easy to remove if we
decide to sunset perps. Nothing under `backend/shared/src/perps/` is imported by
the existing CPMM / multi / numeric code paths; integration points are narrow and
explicit (see "Integration points" below).

## Files

- `engine.ts` — the authoritative entry point. Exports:
  - `openOrAddPosition(contractId, userId, direction, mana, leverage)` — opens a new
    position or adds to an existing same-side position. Rejects opposite-side opens
    (one-way mode). Returns `{ position, event, isNewUniqueBettor }`.
  - `closePosition(contractId, userId, direction)` — closes a user's position at the
    current oracle price, credits/debits mana, and writes a `close` event.
  - `runOracleUpdate(contract)` — applies liquidations + ADL at the latest oracle
    price. Called by the hourly scheduler.
  - `runFunding(contract)` — applies one funding period to all open positions.
    Called by the hourly scheduler.
  - `resolvePerp(contractId, resolverId)` — settles every open position at the
    current oracle price and returns remaining pool balances to the creator.

  Every mutating call acquires a `pg_advisory_xact_lock` keyed on the contract id
  so per-contract state transitions are serialized.

- `queries.ts` — small SQL helpers used by `engine.ts` to keep the engine focused
  on state transitions rather than SQL construction. Row ↔ object converters live
  here too (e.g. `rowToPosition`).

- `user-contract-metrics.ts` — rebuilds `user_contract_metrics` rows for a perp
  contract from its events + positions. The engine is the authoritative writer
  for perp metrics; we do not let `calculate-metrics.ts` touch them.

## Pure math

All pure math (funding, liquidation, ADL, entry/exit accounting) lives in
`common/src/perps/amm.ts` and is unit-testable without a database. Formulas come
from the ManiPerp paper; see `PerpContract.data` for parameter knobs.

## API surface

Endpoints are registered in `backend/api/src/routes.ts` and schemas live in
`common/src/api/schema.ts`:

- `POST /create-perp` (admin) — creates a new perp market.
- `POST /place-perp-trade` — opens or adds to a position.
- `POST /close-perp-position` — closes a position.
- `GET /get-perp-positions` — reads open positions for a contract (optionally
  filtered by `userId`).
- `GET /get-oracle-price`, `/get-oracle-price-series` — read oracle data.
- `GET /get-known-oracle-feeds` (admin) — autocomplete for the admin create page.
- `POST /internal-write-oracle-price` (admin-authed, intended for bots) — writes a
  single `(feed_id, ts, price)` row idempotently.

## Scheduler

`backend/scheduler/src/jobs/update-perps.ts` runs hourly, calls
`runOracleUpdate` then `runFunding` for every unresolved perp contract, and emits
`perp_liquidation` / `perp_adl` notifications for affected users.

## Integration points (grep for these to find everything)

- `outcomeType === 'PERP'` — UI switch branches.
- `contract.mechanism === 'perp'` — backend branches.
- `PERPS_ENABLED` — feature flag used in API handlers and scheduler.

The touched files outside this folder are:

- `common/src/contract.ts` — adds the `PERP` outcome and `perp` mechanism.
- `common/src/api/{schema,market-types}.ts` — registers perp endpoints.
- `common/src/calculate-metrics.ts` — pass-through branch (engine is authoritative).
- `common/src/user-notification-preferences.ts`, `notification.ts` — new notif types.
- `backend/api/src/{resolve-market,unresolve}.ts` — perp resolve/block unresolve.
- `backend/api/src/{get-market-loan-max,get-free-loan-available,claim-free-loan,request-loan,get-next-loan-amount}.ts`
  — exclude perps from loans.
- `backend/shared/src/update-user-portfolio-histories-core.ts` — perp PnL branch.
- `backend/shared/src/send-market-movement-notifications.ts` — exclude perps.
- `backend/shared/src/importance-score.ts` — perp scoring branch.
- `backend/scheduler/src/jobs/{index,update-league,update-perps}.ts` — schedule
  wiring + league profit branch.
- `web/components/contract/{contract-overview,contracts-table,feed-contract-card}.tsx`,
  `web/components/perps/*`, `web/components/search.tsx`,
  `web/pages/admin/create-perp.tsx` — frontend surface.

## Removal checklist

1. Set `PERPS_ENABLED = false` to hide the admin page and reject new trades.
2. Resolve all remaining perp contracts (creator / mod flow settles at oracle).
3. Delete this folder, `common/src/perps/`, `web/components/perps/`,
   `web/pages/admin/create-perp.tsx`.
4. Remove the integration branches listed above (each is flagged with
   `PERP` / `'perp'` for easy grep).
5. Drop the tables created by `backend/supabase/migrations/2026042201_add_perps.sql`:
   `oracle_prices`, `contract_perp_positions`, `contract_perp_events`,
   `contract_perp_funding_events`.
