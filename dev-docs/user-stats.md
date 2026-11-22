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

**Triggers:** three statement-level `AFTER` triggers on `contract_bets` (insert, update, delete), with transition tables, do the counting. Three row-level `BEFORE` triggers (insert, update, delete) write the journal the backfill needs, and only for bets dated at or before the bound (see Backfill below), so a new bet never calls them.

- Each statement upserts one row per affected user, in `user_id` order.
- An update counts as the old row removed and the new row added. Later fills, cancellations and expiries change nothing and write nothing.
- `TRUNCATE` is refused, because it would skip the delete trigger.
- Every user whose count a bet changes (the bettor, or a maker whose order fills) already has their balance updated in the same transaction, before the bet rows are written. Redemptions never write to `user_stats`: answer creation writes redemption bets before balances, so counting them could deadlock with a bet.
- `user_stats` has only its primary key indexed, so the increments are HOT updates (fill factor 80).

**Measured cost** (Postgres 15, JIT off, 300k-bet table, 2,000 runs each, before and after both migrations; two runs after a warm-up run, ranges of the medians):

|                                                    | Before       | After        |
| -------------------------------------------------- | ------------ | ------------ |
| One bet inserted, own transaction                  | 3.35–3.65 ms | 3.27–3.32 ms |
| One maker fill of an order from before the install | 3.30–3.87 ms | 3.09–3.31 ms |
| 5,000 new orders cancelled in one statement        | 186–191 ms   | 169–222 ms   |

The differences are within noise. A new bet never calls the journal triggers: each carries the bound as a literal in its `WHEN` clause. (PostgreSQL doesn't plan a trigger's `WHEN`; calling `user_stats_bet_bound()` there made the 5,000-order cancel take 262 ms.) The first change to an order from before the install pays one journal write.

**What the counts rely on:**

- The guards in `2026112219_contracts_guards.sql` fix each market's id and token and refuse every hard delete and truncate. The delete-market endpoint soft-deletes. Both live counts and the backfill can therefore look up the same token by market id, even after a historical bet is deleted. A CASH market's id cannot be reused for a MANA market.
- A bet is always written after its market exists, which every code path does.

**Ranks:** live, in the same statement as the count. The user's two rows are read by primary key; only a positive total runs the pass over both tables that counts users with more trades (rank = that count + 1, so ties share a rank). The rank is null for 0. Percentiles still divide by the number of accounts, counted once an hour.

**Access:** the API roles get `SELECT` on the two count tables and nothing else, because `TRUNCATE` ignores row-level security.

## Backfill

`backend/scripts/backfill-user-stats.ts --apply` adds the history into `user_stats_baseline`. It runs one `created_time` window per transaction, sizes the windows itself (aiming for about 1.5 s each), can be stopped and rerun, and is safe to run twice at once.

How each window reconstructs the bets at install time:

- The migration first takes a write lock on `contract_bets`, then records the **bound**: the newest `created_time` there. Every bet that existed then is dated at or before it. The bound is written into the function `user_stats_bet_bound()`, so a transaction that started before the migration still sees it.
- The journal keeps its first entry for each bet id. If a bet existed at install, its first update or delete saves its old image before the id can be reused. An update then marks the new id as absent at install if its new timestamp is at or before the bound. Saving the image first preserves it when the id stays the same.
- A backdated insert marks its id as absent before a nested statement can update or delete the row. The other row trigger, `contract_bet_populate`, always returns `NEW`.
- `BEFORE INSERT` writes no marker when a row with the id is already there: the insert then fails on the key, or takes the upsert path, whose `BEFORE UPDATE` saves that row's image. It looks for that row with `for key share`. A concurrent delete of the row holds a conflicting lock, so the insert waits; once the delete commits, read committed finds no row and writes the marker, and serializable fails to serialize and retries. A row it does find stays locked, so its id can't be freed and reused by this insert.
- The `AFTER INSERT` trigger repeats the marker for every row actually inserted, as a backstop (an upsert that took the update path isn't in its transition table).
- Each window is a single statement. It adds the bets with no journal row as they are now, plus the journal rows of bets that existed. Within that statement's snapshot, a bet that existed at the install either hasn't changed yet (its current state is its state at the install) or has a journal row holding that state, never both. The triggers have added every change since.
- Each window locks its progress row before choosing its range, refuses a window that isn't positive, and moves the progress only forward, in the same transaction as the counts.

Until the backfill is complete, `get-user-achievements` keeps reading `ach_trades`. It re-checks once a minute, and switches for good once complete.

Tests (`backend/shared/src/user-stats.test.ts`, against PGlite with the real `contract_bets` table and trigger) check:

- each counting rule;
- limit-order fills, bulk statements, user changes and deletes;
- that the counters equal a direct recount after a backfill interleaved with fills of old orders, deletes, backdated inserts, reassignments, and a later bet moved back before the bound;
- that the backfill never writes `user_stats`;
- that a window that isn't positive is refused;
- historical id reuse, backdated inserts changed by nested statements or deleted in a later statement, and both conflict actions on historical and new ids;
- the contract guards, reruns, and a failing window.

Removing the insert marker's existence check fails the backdated upsert tests; removing the early insert marker fails the nested-change tests; moving either image write back to an `AFTER` trigger fails a same-statement test. PGlite has one session, so the concurrent-delete case is covered by the lock argument above, and the replacement test covers a committed delete followed by an insert.

## Rollout

1. **API first.** It writes `isAutoRedemption` and reads `user_stats` only once a backfill is complete, so it is safe before the migration. Deploying it first means no running server writes unflagged redemption legs after the triggers exist.
2. Apply `2026112219_contracts_guards.sql` on dev, then prod. It installs the market id, token, delete and truncate guards in one short transaction.
3. Apply `2026112220_user_stats.sql` on dev, then prod. It briefly blocks writes to `contract_bets` to record the bound and install the triggers together. Both migrations use a 5 s lock timeout and can be retried. Stop the backfill before retrying the install if it has started.
4. Run `backfill-user-stats.ts --apply` on dev, then prod. It is resumable. Once complete, `--verify <userId>` compares one user's count with a direct count in the same snapshot and exits 1 on a mismatch.
5. Apply `2026112221_achievement_rank_definitions.sql` after the backfill completes. It builds the two new rank views under other names, then swaps them in one short transaction.
6. Deploy web (one description).
7. Later, a cleanup PR:
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
