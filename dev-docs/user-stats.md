# Live user stats (`user_stats`)

Per-user counters kept by the database, in the same transaction as the write that changes them. The first one is **trades**, shown on the profile and used by the Trades Placed trophy. The pattern is meant for more counters later.

## Why

- `get-user-achievements` read trades from `ach_trades`, whose refresh job (`update-ach-trades`) has been off since September 2025. Anyone who joined since shows 0 trades, and everyone else's count stopped then. The old job also rescanned all of `contract_bets` (about 90M rows).
- The endpoint itself was slow. Prod load-balancer logs for 190 requests on 21 Nov 2026: p50 1.3 s, p90 5.7 s, max 38 s. Each request ran a view that ranks every referrer, which scans all users, plus two passes over the user's market metrics and a `count(*)` over every user.

## How trades are counted

**What counts:** a `contract_bets` row in a mana market whose filled `amount` is not zero, not via the API, and not a redemption, as decided by `user_stats_bet_trades`.

- A limit order counts once, when it first fills. A partly filled order that is later cancelled still counts.
- A market buy or sell counts at once.
- The sell legs that automatically redeem a full set of a multiple-choice market are excluded. They are flagged `isAutoRedemption` in `data` (set in `redeem-shares.ts`), because `redeem-shares` itself needs them stored as ordinary sells to work out holdings.
- Perp trades are not bets and don't count, as before.

**Tables** (migration `2026112220_user_stats.sql`):

- `user_stats`: one row per user, the trades counted since the install. Only the triggers write it.
- `user_stats_baseline`: the trades before the install, written only by the backfill.

A user's count is the sum of the two. They are kept apart so the backfill never writes a row a bet also writes. Otherwise a bet could wait on the backfill, or fail to serialize against it and run out of retries.

**Triggers:** three statement-level `AFTER` triggers on `contract_bets` (insert, update, delete), with transition tables.

- Each statement upserts one row per affected user, in `user_id` order.
- An update counts as the old row removed and the new row added. Later fills, cancellations and expiries change nothing and write nothing.
- `TRUNCATE` is refused, because it would skip the delete trigger.
- Every user whose count a bet changes (the bettor, or a maker whose order fills) already has their balance updated in the same transaction, before the bet rows are written. Redemptions never write to `user_stats`: answer creation writes redemption bets before balances, so counting them could deadlock with a bet.
- `user_stats` has only its primary key indexed, so the increments are HOT updates (fill factor 80).

**Measured cost** (Postgres 15, JIT off, 300k-bet table, 2,000 runs each, before and after the triggers):

|                                         | Before                   | After                    |
| --------------------------------------- | ------------------------ | ------------------------ |
| One bet inserted, own transaction       | p50 2.73 ms, p95 3.34 ms | p50 2.65 ms, p95 3.07 ms |
| One maker fill                          | p50 2.94 ms, p95 3.51 ms | p50 2.89 ms, p95 3.37 ms |
| 5,000 orders cancelled in one statement | 181 ms                   | 197 ms                   |

The per-bet difference is within noise.

**What the counts rely on:**

- A market's token never changes after creation. A guard trigger on `contracts` (migration `2026112222`) refuses it; it fires only for an `UPDATE` that names `token`, which no code does.
- A bet is always written after its market exists, which every code path does.

**Ranks:** live, in the same statement as the count: `1 + count(*)` of users with more trades, over live plus baseline. The rank is null for 0. Percentiles still divide by the number of accounts, counted once an hour.

**Access:** the API roles get `SELECT` on the two count tables and nothing else, because `TRUNCATE` ignores row-level security.

## Backfill

`backend/scripts/backfill-user-stats.ts --apply` adds the history into `user_stats_baseline`. It runs one `created_time` window per transaction, sizes the windows itself (aiming for about 1.5 s each), can be stopped and rerun, and is safe to run twice at once.

How it stays exact while bets keep changing:

- The migration first takes a write lock on `contract_bets`, then records the **bound**: the newest `created_time` there. Every bet that existed then is dated at or before it. The bound is written into the function `user_stats_bet_bound()`, so a transaction that started before the migration still sees it.
- While the backfill is unfinished, the triggers write to `user_stats_bet_journal`:
  - the first time a bet dated at or before the bound is updated or deleted, its state before the change;
  - for any row that comes to be dated at or before the bound after the install (inserted, or moved there), a row saying it did not exist then.
- Each window is a single statement. It adds the bets with no journal row as they are now, plus the journal rows of bets that existed. Within that statement's snapshot, a bet that existed at the install either hasn't changed yet (its current state is its state at the install) or has a journal row holding that state, never both. The triggers have added every change since.
- Each window locks its progress row before choosing its range, refuses a window that isn't positive, and moves the progress only forward, in the same transaction as the counts.

Until the backfill is complete, `get-user-achievements` keeps reading `ach_trades`. It re-checks once a minute, and switches for good once complete.

Tests (`backend/shared/src/user-stats.test.ts`, against PGlite with the real `contract_bets` table and trigger) check:

- each counting rule;
- limit-order fills, bulk statements, user changes and deletes;
- that the counters equal a direct recount after a backfill interleaved with fills of old orders, deletes, backdated inserts, reassignments, and a later bet moved back before the bound;
- that the backfill never writes `user_stats`;
- that a window that isn't positive is refused;
- the token guard, reruns, and a failing window.

Removing the journal check, either journal write, or the "moved back" marker fails a test.

## Rollout

1. **API first.** It writes `isAutoRedemption` and reads `user_stats` only once a backfill is complete, so it is safe before the migration. Deploying it first means no running server writes unflagged redemption legs after the triggers exist.
2. Migrations `2026112220_user_stats.sql`, then `2026112222_contracts_token_fixed.sql` (the token guard), on dev, then prod. Each is one short transaction. The first blocks `contract_bets` writes for well under a second; if a write holds the table more than 5 s it gives up and can be run again (stop the backfill first if it has started).
3. `backfill-user-stats.ts --apply` on dev, then prod. It is resumable; `--verify <userId>` compares one user's count with a direct count, read at the same moment, and exits 1 on a mismatch once complete.
4. Migration `2026112221_achievement_rank_definitions.sql`. It builds the two new rank views under other names, then swaps them in one short transaction.
5. Web (one description).
6. Later, a cleanup PR:
   - replace the triggers with versions that don't journal, then drop `user_stats_bet_journal`;
   - optionally fold `user_stats_baseline` into `user_stats` in small batches;
   - drop `ach_trades` and the disabled `update-ach-trades` job;
   - close #4312.

## Accepted limits

- **Old redemption legs count.** Full-set redemption legs written before the flag existed look like ordinary sells, so they count as trades: a read-only prod sample found 143 such legs in 11 groups. Telling them apart from a user selling every answer at once would mean guessing. The counts are cosmetic, and no new ones are written once step 1 is done.
- **Main's old Achievements section can show a stale count.** It caches its response for the browser session. The Trophies tab (#3719) replaces it with a store that rereads on each visit.

## Other changes in the same PR

- `get-user-achievements` runs one indexed query per user:
  - referrals through `user_referrals_idx`, instead of the all-referrers view;
  - volume and P&L in one pass over the user's market metrics;
  - the league maximum from `leagues` directly;
  - created-market counts in one aggregate.
    On prod its plan has no full scan of a large table. A user with no `users` row still gets the stats that need only the id.
- Migration `2026112221_achievement_rank_definitions.sql` makes two ranks measure the number shown next to them:
  - comments: all comments, not only liked ones;
  - markets created: all mana markets, not only ones with 2+ traders.

## Not changed

- Volume stays computed from `user_contract_metrics`. Perps write volume there without bet rows, so it can't come from bets.
- Volume's rank and the other ranks still come from the nightly materialized views.
