# Live user stats (`user_stats`)

Per-user counters kept by the database, in the same transaction as the write that changes them. The first one is **trades**, shown on the profile and used by the Trades Placed trophy. The pattern is meant for more counters later.

## Why

- `get-user-achievements` read trades from `ach_trades`, whose refresh job (`update-ach-trades`) has been off since September 2025. Anyone who joined since shows 0 trades, and everyone else's count stopped then. The old job also rescanned all of `contract_bets` (about 90M rows).
- The endpoint itself was slow. Prod load-balancer logs for 190 requests on 21 Nov 2026: p50 1.3 s, p90 5.7 s, max 38 s. Each request ran a view that ranks every referrer, which scans all users, plus two passes over the user's market metrics and a `count(*)` over every user.

## How trades are counted

**What counts:** a `contract_bets` row in a mana market whose filled `amount` is not zero, not via the API, and not a redemption, as decided by `user_stats_bet_trades`.

- A limit order counts once, when it first fills. A partly filled order that is later cancelled still counts.
- A market buy or sell counts at once.
- The sell legs that automatically redeem a full set of a multiple-choice market are excluded. They are flagged `isAutoRedemption` in `data` (set in `redeem-shares.ts`) because `redeem-shares` itself needs them stored as ordinary sells.
- Perp trades are not bets and do not count, as before.

**Triggers** (migration `2026112220_user_stats.sql`): three statement-level `AFTER` triggers on `contract_bets` (insert, update, delete), with transition tables.

- Each statement upserts one row per affected user, in `user_id` order.
- An update counts as the old row removed and the new row added. Later fills, cancellations and expiries change nothing and write nothing.
- `TRUNCATE` is refused, because it would skip the delete trigger.
- Every user whose count a bet changes (the bettor, or a maker whose order fills) already has their balance updated in the same transaction, before the bet rows are written. Redemptions never write to `user_stats`, which avoids a lock-order clash with answer creation, which writes redemption bets before balances.
- `user_stats` has only its primary key indexed, so the increments are HOT updates (fill factor 80).

**Ranks:** live, by one pass over `user_stats`: `1 + count(*) where trades > mine`. The rank is null for 0. Percentiles still divide by the number of accounts, counted once an hour.

## Backfill

The triggers count everything from the moment the migration installs them. `backend/scripts/backfill-user-stats.ts --apply` adds the history. It runs one `created_time` window per transaction, sizes the windows itself (aiming for about 1.5 s each), can be stopped and rerun, and is safe to run twice at once.

How it stays exact while bets keep changing:

- The migration takes a write lock on `contract_bets` and records the **bound**: the newest `created_time` there. Every bet that existed then is dated at or before it. The bound is written into the function `user_stats_bet_bound()`, so a transaction that started before the migration still sees it.
- While the backfill is unfinished, the triggers write to `user_stats_bet_journal`:
  - the first time a bet dated at or before the bound is updated or deleted, its state before the change;
  - for a bet inserted after the install but dated at or before the bound, a row saying it did not exist then.
- Each window is a single statement. It adds the bets with no journal row as they are now, plus the journal rows of bets that existed. Within that statement's snapshot, a bet that existed at the install either hasn't changed yet (its current state is its state at the install) or has a journal row holding that state, never both. The triggers have added every change since.
- Each window locks its progress row before choosing its range, and moves the progress in the same transaction as the counts.
- It sets a 500 ms lock timeout, below the 1 s deadlock timeout, so it gives way to bets rather than making one fail.

Until the backfill is complete, `get-user-achievements` keeps reading `ach_trades`. It re-checks once a minute, and switches for good once complete.

Tests (`backend/shared/src/user-stats.test.ts`, against PGlite with the real `contract_bets` table and trigger) check:

- each counting rule;
- limit-order fills, bulk statements, user changes and deletes;
- that the counters equal a direct recount after a backfill interleaved with fills of old orders, deletes, backdated inserts and reassignments;
- reruns, and a failing window.

Removing the journal check or either journal write fails a test.

## Rollout

1. Migration `2026112220_user_stats.sql` on dev, then prod. It runs as one transaction and blocks `contract_bets` writes for well under a second. If a write holds the table for more than 5 s it gives up, and can simply be run again.
2. `backfill-user-stats.ts --apply` on dev, then prod. It is resumable; `--verify <userId>` compares one user's counter with a direct count.
3. Deploy the API. It reads `user_stats` once the backfill is complete, so steps 2 and 3 can be in either order.
4. Later, a cleanup PR:
   - replace the triggers with versions that don't journal, then drop `user_stats_bet_journal`;
   - drop `ach_trades` and the disabled `update-ach-trades` job;
   - close #4312, the scheduler-based fix this replaces.

## Other changes in the same PR

- `get-user-achievements` runs one indexed query per user:
  - referrals through `user_referrals_idx`, instead of the all-referrers view;
  - volume and P&L in one pass over the user's market metrics;
  - the league maximum from `leagues` directly;
  - created-market counts in one aggregate.
    On prod its plan has no full scan of a large table.
- Migration `2026112221_achievement_rank_definitions.sql` makes two ranks measure the number shown next to them:
  - comments: all comments, not only liked ones;
  - markets created: all mana markets, not only ones with 2+ traders.

## Not changed

- Volume stays computed from `user_contract_metrics`. Perps write volume there without bet rows, so it can't come from bets.
- Volume's rank and the other ranks still come from the nightly materialized views.
