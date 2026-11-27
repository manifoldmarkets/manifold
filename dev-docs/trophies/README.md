# Trophies

The 11 main trophies have 105 milestones. The ten-step Spectrum runs from green through teal, blue, indigo, purple, pink, crimson, orange and gold to prismatic. Net Worth has nine steps and skips teal. Legacy Charity keeps six colours (green, blue, purple, crimson, gold and prismatic). The three Getting Started ladders have nine additional milestones.

`common/src/trophies.ts` defines thresholds, titles, claim eligibility and pin rules. Claiming records the selected milestone and all lower ones in `user_trophy_milestones`. The records last. Each eligible reward pays once. Retired IDs are ignored. Keep IDs stable after launch.

**Net Worth** shows the highest tier covered by the latest portfolio snapshot, starting at M2,500 for Minnow and ending at M500,000 for Whale. It adds mana balance and investment value from the same snapshot and rounds down to whole mana. Investment value already accounts for position loans. The live stat uses the latest available snapshot at any age and is zero before the first one. A claim checks that value inside its transaction, with no holding period. A fresh snapshot (at most 72 hours old) can also raise the stored peak, both at claim time and in the nightly job.

A drop lowers the displayed Net Worth tier. A higher previous tier appears as history. Below Minnow, a pinned badge shows the best tier in grey with a **Best** label. Claims still count towards the showcase slots. Other claimed milestone badges last, including Prediction Streak, which measures the longest-ever streak.

**Account Age** uses UTC calendar anniversaries at signup, 1, 3, 6, 12 and 18 months, then 2, 3, 4 and 5 years. The live stat expresses completed months plus the elapsed fraction of the current month in years. A January 31 signup reaches one month on the last day of February at its signup time.

**Profitable Markets** runs from Lucky (10), Steady (25), Savvy (50), Shrewd (100), Tactician (250), Sage (400), Seer (500) and Sharpe (750) to Clairvoyant (1,000) and Oracle (2,000). Talent Scout requires 25 qualifying referrals.

Owners can browse all milestones. Visitors see claimed trophies, current Net Worth and nightly titles. Showcase pins are stored in `user_showcase`. Slots open at 0, 10 and 25 claimed milestones. A pin can show a claimed trophy or the current league badge.

## Nightly titles

The main scheduler runs `update-trophy-ranks` at 4:10 AM Los Angeles time after the achievement refreshes. A score must reach the trophy's prismatic threshold to qualify.

| Trophy             | Ranked value                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Net Worth          | Latest qualifying portfolio snapshot for an active trader                                                                    |
| Prediction Streak  | Longest of the paid bonus streak, longest ended streak and current streak, from the 3:40 AM transactions view                |
| Profitable Markets | Resolved, undeleted, non-cancelled mana markets where the user's finite summary profit exceeds M0.00000001                   |
| Markets Created    | Public, undeleted mana markets you created with at least 10 traders, excluding polls and bounties                            |
| Creator Popularity | All-time creator traders, counted once per market                                                                            |
| Liked Comments     | Distinct visible market or legacy post comments by the holder that another eligible person liked                             |
| Leagues            | Silver, Gold, Platinum and Diamond score 1–4. Each Masters season adds one to 4. GOAT requires 8 Masters seasons (level 12). |

For Net Worth, an active trader has placed a trade or order in the last 90 days, or has an open order that can still fill. The 90-day window runs from placement and includes perpetuals orders and maker orders that have since filled. To qualify through an older open order, the holder needs at least M1 in spendable mana and trading must be enabled for the market's token. The order must have remaining quantity, be uncancelled and unexpired, and be on a market that is still trading with an unresolved answer if it specifies one.

Ranked accounts must be people. Bots, deleted accounts, accounts in `BANNED_TRADING_USER_IDS` and users with active bans other than mod alerts are ineligible. The migration seeds `trophy_rank_exclusions` with the production IDs of `@Manifund`, `@Manifold`, `@ManifoldSports`, `@ManifoldPolitics`, `@MNX` and `@predyx_markets`. The same person rules apply to likers and qualifying referrals independently of that exclusions table.

Markets Created uses `contracts.unique_bettor_count`, which includes bot traders. The streak rank reflects the last successful `mv_ach_txns_achievements` refresh.

Equal scores share a rank. First place holds #1, ranks 2–5 hold Mega and ranks 6–25 hold Super. The prefix uses the prismatic milestone's name, such as Mega Whale. Held titles appear automatically above the pins. Falling out removes the title and the trophy card can show the best tier previously held.

| New table                | Contents                                                                    |
| ------------------------ | --------------------------------------------------------------------------- |
| `trophy_rank_exclusions` | Private holder exclusions and their reasons                                 |
| `user_net_worth_peaks`   | Private positive high recorded by a claim or nightly run, and its timestamp |
| `trophy_ranks`           | Public current holders, values, ranks and a single publication timestamp    |
| `trophy_rank_state`      | Public timestamp of the latest publication, including a run with no holders |
| `user_trophy_rank_peaks` | Public best numeric rank, first ranked time and time of the best rank       |

A session advisory lock serializes nightly publishers. Each run samples net worth and computes all ranks in one read-only, repeatable-read transaction. A read-committed transaction publishes the sampled highs, ranks, best ranks and publication time together. A higher peak recorded by a concurrent claim wins. `get-user-trophies` reads ranks, peaks, claims, starter progress and pins in one snapshot.

To exclude another holder, insert their user ID and a reason. Dev needs its own rows for any desired exclusions.

```sql
insert into
  trophy_rank_exclusions (user_id, reason)
values
  ('<user ID>', '<reason>');
```

## Known limitations

- A portfolio snapshot older than 72 hours drops out of Net Worth ranks. In the production review, 2 of 63 accounts at M500,000 or more had stale snapshots. Neither had traded in the preceding 90 days.
- The Net Worth peak shown includes today's fresh snapshot. It becomes permanent when you claim a Net Worth milestone or the nightly run records it. A dip before then can lower the displayed peak.
- The portfolio writer reads positions before it reads cash. A sale between those reads can put both the sold position and its proceeds in one snapshot, inflating Net Worth. During the manual review of the top 25, check each holder's sales against their snapshot time.
- The writer updates its in-memory portfolio before the history insert succeeds. If the insert fails and the portfolio stays the same on the next run, the writer can advance `last_calculated` on the old row. Stale values can then pass the 72-hour freshness check for peak recording and ranks.
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
