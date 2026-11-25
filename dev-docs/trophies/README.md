# Trophies

Each of the 11 lifetime trophies has six milestones, in ascending order: green, blue, purple, crimson, gold and prismatic. Whale is the prismatic Net Worth milestone at M500,000. Net worth adds the mana balance and investment value from the same portfolio snapshot. Investment value already accounts for position loans. The achievements API reports the latest snapshot at any age, or zero before the first snapshot. Claims use the higher of the stored nightly peak and the latest snapshot if it is at most 72 hours old. The same age limit applies to snapshots used for nightly peaks and ranks.

`common/src/trophies.ts` defines the ladders and the shared progress, title, claim and pin rules. `get-user-achievements` reads lifetime stats. The achievements grid retains its own stat and rank definitions. `claim-trophy` rechecks the stat and records the requested milestone and all lower ones in `user_trophy_milestones`. Claims last even if the stat falls. Retired IDs are ignored. Keep IDs stable after launch.

Profiles show claimed milestones to visitors. Owners can also browse unclaimed milestones. Showcase pins are stored in `user_showcase`. Slots open at 0, 10 and 25 claimed milestones. A pin can show a claimed trophy or the current league badge.

## Nightly titles

The main scheduler runs `update-trophy-ranks` at 4:10 AM Los Angeles time after the achievement refreshes. A score must reach the trophy's prismatic threshold to qualify.

| Trophy             | Ranked value                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| Net Worth          | Latest qualifying portfolio snapshot for an active trader                                                     |
| Prediction Streak  | Longest of the paid bonus streak, longest ended streak and current streak, from the 3:40 AM transactions view |
| Profitable Markets | Resolved, undeleted, non-cancelled mana markets where the user's finite summary profit exceeds M0.00000001    |
| Markets Created    | Public, undeleted mana markets you created with at least 10 traders, excluding polls and bounties             |
| Creator Popularity | All-time creator traders, counted once per market                                                             |
| Liked Comments     | Distinct visible market or legacy post comments by the holder that another eligible person liked              |
| Leagues            | Gold, Platinum and Diamond score 1, 2 and 3. Each Masters season adds one to 3                                |

For Net Worth, an active trader has placed a trade in the last 90 days or has an open limit order on a market that is still trading. To qualify through an order, the holder needs at least M1 in spendable mana. The order must have remaining quantity, be uncancelled and unexpired, and be on an unresolved answer if it specifies one. Filling an older order does not restart the 90-day window.

Ranked accounts must be people. Bots, deleted accounts and users with active bans other than mod alerts are ineligible. SQL-managed entries in `trophy_rank_exclusions` also exclude holders. The same person rules apply to likers and qualifying referrals independently of that exclusions table.

Markets Created uses `contracts.unique_bettor_count`, which includes bot traders. The streak rank reflects the last successful `mv_ach_txns_achievements` refresh.

Equal scores share a rank. First place holds #1, ranks 2–5 hold Mega and ranks 6–25 hold Super. The prefix uses the prismatic milestone's name, such as Mega Whale. Held titles appear automatically above the pins. Falling out removes the title and the trophy card can show the best tier previously held.

| New table                | Contents                                                                    |
| ------------------------ | --------------------------------------------------------------------------- |
| `trophy_rank_exclusions` | Private holder exclusions, seeded by five production account IDs            |
| `user_net_worth_peaks`   | Private positive nightly high and the time it was reached                   |
| `trophy_ranks`           | Public current holders, values, ranks and a single publication timestamp    |
| `trophy_rank_state`      | Public timestamp of the latest publication, including a run with no holders |
| `user_trophy_rank_peaks` | Public best numeric rank, first ranked time and time of the best rank       |

The job samples net worth once and publishes ranks, personal bests and the publication time in one repeatable-read transaction. `get-user-trophies` reads ranks, peaks, claims, starter progress and pins in one snapshot.

To exclude another holder, insert their user ID and a reason. Dev needs its own rows for any desired exclusions.

```sql
insert into
  trophy_rank_exclusions (user_id, reason)
values
  ('<user ID>', '<reason>');
```

## Known limitations

- The portfolio writer reads positions before it reads cash. A sale between those reads can put both the sold position and its proceeds in one snapshot, inflating Net Worth. During the manual review of the top 25, check each holder's sales against their snapshot time.
- The writer updates its in-memory portfolio before the history insert succeeds. If the insert fails and the portfolio stays the same on the next run, the writer can advance `last_calculated` on the old row. Stale values can then pass the 72-hour freshness check for claims, peaks and ranks.
- Two legacy multiple-choice markets in production have `isResolved` set in their data and a null contract `resolution`. Profitable Markets skips both, so profitable holders receive no credit for either market.

## Onboarding and rewards

The three Getting Started ladders count market-days, distinct markets and distinct days among an account's first 500 bets. Each qualifying market-day needs at least M10 in non-API mana buys. Eligible accounts can collect the existing starter rewards and M25 for Newcomer, subject to the account's reward multiplier. The eligibility cutoff is 1 November 2026 on dev and disabled on prod. Everyone can claim Newcomer.

`claim-trophy` records payment in `user_trophy_rewards` in the same transaction as the payout. Admin unclaims preserve this record. Navigation and the Trophies tab share claim counts and unlock notifications. Missing badge art falls back to the milestone emoji. Rank prizes are separate work.

## Deploy

The existing trophy migrations, live trade counters and completed trade backfill are prerequisites. Run `backend/supabase/migrations/2026112501_user_reactions_comment_likes_idx.sql` (a concurrent index, outside a transaction), then `2026112502_trophy_ladders_v2.sql`. Deploy the API and main scheduler, then web. Held ranks first populate on a successful nightly run.

After the concurrent build, verify the index before continuing.

```sql
select indisvalid from pg_index where indexrelid = 'user_reactions_comment_likes_by_owner'::regclass;
```

If the result is false, run `drop index concurrently user_reactions_comment_likes_by_owner;` outside a transaction, rerun `2026112501` and verify again.

### Dev only

Run this once on dev immediately after deploying v2. Some lifetime milestone IDs now have higher thresholds. Removing their old claims prevents a 200-day Phoenix from becoming a 1,000-day Phoenix. Production has no pre-v2 claims.

```sql
delete from user_trophy_milestones
where
  trophy_id not in (
    'starter-trades',
    'starter-markets',
    'starter-days'
  )
  and (trophy_id, milestone_id) <> ('account-age', 'newcomer');
```
