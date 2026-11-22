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

**Triggers:** three statement-level `AFTER` triggers on `contract_bets` (insert, update, delete), with transition tables, do the counting. Two row-level `BEFORE` triggers (update, delete) save the state of a bet from before the install for the backfill (see Backfill below).

- Each statement upserts one row per affected user, in `user_id` order.
- An update counts as the old row removed and the new row added. Later fills, cancellations and expiries change nothing and write nothing.
- `TRUNCATE` is refused, because it would skip the delete trigger.
- Every user whose count a bet changes (the bettor, or a maker whose order fills) already has their balance updated in the same transaction, before the bet rows are written. Redemptions never write to `user_stats`: answer creation writes redemption bets before balances, so counting them could deadlock with a bet.
- `user_stats` has only its primary key indexed, so the increments are HOT updates (fill factor 80).

**Measured cost** (Postgres 15, JIT off, 300k-bet table, 2,000 runs each; three runs before and after the migrations, ranges of the medians):

|                                                    | Before       | After        |
| -------------------------------------------------- | ------------ | ------------ |
| One bet inserted, own transaction (p50)            | 3.35–3.42 ms | 3.30–3.52 ms |
| One maker fill of an order from before the install | 3.17–3.52 ms | 3.35–3.56 ms |
| 5,000 new orders cancelled in one statement        | 165–173 ms   | 172–187 ms   |

The per-bet differences are within noise. The maker fill pays one journal write (about 0.1 ms), and only the first time an order from before the install changes. The two BEFORE triggers carry the bound as a literal in their WHEN clause: PostgreSQL doesn't plan a trigger's WHEN, and calling `user_stats_bet_bound()` there made the 5,000-order cancel take 262 ms.

**What the counts rely on:**

- The guards in `2026112219_contracts_guards.sql` run before counters are enabled. One refuses changes to a market's token. Another refuses to hard-delete a market referenced by a current bet or any journal row. The backfill still needs the market's token after a historical bet is deleted.
- The delete guard takes a `share` lock on `contract_bets` before looking for references. Bet and journal writers hold a conflicting lock through commit. Under read committed the guard sees their commits in a fresh snapshot after the wait. With both transactions serializable, PostgreSQL detects conflicting reads of the bets and the market. Repeatable read keeps its old snapshot, so the guard refuses deletes at that isolation level. Only a hard delete pauses bet writes this way. The delete-market endpoint soft-deletes.
- A bet is always written after its market exists, which every code path does.
- Accepted gap: a serializable transaction that writes the first bet on a market without locking the market row, with a snapshot from before a read-committed hard delete of that market, can count a bet whose market is gone. The bet endpoints lock the market row first (`helpers/bets.ts`, `place-multi-bet.ts`), which turns this into a serialization failure and a retry that finds no market. So it needs both a hard delete, which no code does, and a direct database writer.

**Ranks:** live, in the same statement as the count. The user's two rows are read by primary key; only a positive total runs the pass over both tables that counts users with more trades (rank = that count + 1, so ties share a rank). The rank is null for 0. Percentiles still divide by the number of accounts, counted once an hour.

**Access:** the API roles get `SELECT` on the two count tables and nothing else, because `TRUNCATE` ignores row-level security.

## Backfill

`backend/scripts/backfill-user-stats.ts --apply` adds the history into `user_stats_baseline`. It runs one `created_time` window per transaction, sizes the windows itself (aiming for about 1.5 s each), can be stopped and rerun, and is safe to run twice at once.

How it stays exact while bets keep changing:

- The migration first takes a write lock on `contract_bets`, then records the **bound**: the newest `created_time` there. Every bet that existed then is dated at or before it. The bound is written into the function `user_stats_bet_bound()`, so a transaction that started before the migration still sees it.
- A row-level `BEFORE UPDATE` or `BEFORE DELETE` trigger saves the old image of each bet dated at or before the bound, immediately before the row changes. The statement-level `AFTER INSERT` and `AFTER UPDATE` triggers mark new rows at or before the bound as absent at install. The journal keeps the first entry for each bet ID.
- In a writable `WITH`, the sub-statements share a snapshot, so one cannot change a row another inserted. Every old image comes from before the statement and is written before any statement-level marker, even if the statement reuses an ID. An `ON CONFLICT DO UPDATE` saves the conflicting row through `BEFORE UPDATE`. There is no journal trigger on `BEFORE INSERT`. Across separate statements an earlier insert's marker wins over a later update or delete image.
- Each window is a single statement. It adds the bets with no journal row as they are now, plus the journal rows of bets that existed. Within that statement's snapshot, a bet that existed at the install either hasn't changed yet (its current state is its state at the install) or has a journal row holding that state, never both. The triggers have added every change since.
- Each window locks its progress row before choosing its range, refuses a window that isn't positive, and moves the progress only forward, in the same transaction as the counts.

Until the backfill is complete, `get-user-achievements` keeps reading `ach_trades`. It re-checks once a minute, and switches for good once complete.

Tests (`backend/shared/src/user-stats.test.ts`, against PGlite with the real `contract_bets` table and trigger) check:

- each counting rule;
- limit-order fills, bulk statements, user changes and deletes;
- that the counters equal a direct recount after a backfill interleaved with fills of old orders, deletes, backdated inserts, reassignments, and a later bet moved back before the bound;
- that the backfill never writes `user_stats`;
- that a window that isn't positive is refused;
- historical ID reuse within one statement, backdated inserts deleted in a later statement, and upserts;
- the contract guards, reruns, and a failing window.

Removing the journal check, either journal write, or the "moved back" marker fails a test.

## Rollout

1. **API first.** It writes `isAutoRedemption` and reads `user_stats` only once a backfill is complete, so it is safe before the migration. Deploying it first means no running server writes unflagged redemption legs after the triggers exist.
2. Apply `2026112219_contracts_guards.sql` on dev, then prod. It installs the token and hard-delete guards in one short transaction.
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
