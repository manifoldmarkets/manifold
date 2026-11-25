# Trophies

Each of the 11 lifetime trophies has six milestones, in ascending order: green, blue, purple, crimson, gold and prismatic. Whale is the prismatic Net Worth milestone at M500,000. Net worth is balance plus the value of open positions. Claims use the higher of current net worth and the highest positive nightly observation.

`common/src/trophies.ts` defines the ladders and the shared progress, title, claim and pin rules. `get-user-achievements` reads lifetime stats. The achievements grid retains its own stat and rank definitions. `claim-trophy` rechecks the stat and records the requested milestone and all lower ones in `user_trophy_milestones`. Claims last even if the stat falls. Retired IDs are ignored. Keep IDs stable after launch.

Profiles show claimed milestones to visitors. Owners can also browse unclaimed milestones. Showcase pins are stored in `user_showcase`. Slots open at 0, 10 and 25 claimed milestones. A pin can show a claimed trophy or the current league badge.

## Nightly titles

The main scheduler runs `update-trophy-ranks` at 4:10 AM Los Angeles time after the achievement refreshes. A score must reach the trophy's prismatic threshold to qualify.

| Trophy             | Ranked value                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| Net Worth          | Current net worth, for people who traded in the last 90 days                                                  |
| Prediction Streak  | Longest of the paid bonus streak, longest ended streak and current streak, from the 3:40 AM transactions view |
| Profitable Markets | Resolved, non-cancelled mana markets with positive profit on the user's market-level summary                  |
| Markets Created    | Public, undeleted mana markets created with at least 10 traders                                               |
| Creator Popularity | All-time creator traders, counted once per market                                                             |
| Liked Comments     | Distinct comments liked by at least one other eligible person                                                 |
| Leagues            | Gold, Platinum and Diamond score 1, 2 and 3. Each Masters season adds one to 3                                |

Ranked accounts must be people. Bots, deleted accounts and users with active bans other than mod alerts are ineligible. SQL-managed entries in `trophy_rank_exclusions` also exclude holders. The same person rules apply to likers and qualifying referrals independently of that exclusions table.

Equal scores share a rank. First place holds #1, ranks 2–5 hold Mega and ranks 6–25 hold Super. The prefix uses the prismatic milestone's name, such as Mega Whale. Held titles appear automatically above the pins. Falling out removes the title and the trophy card can show the best tier previously held.

| New table                | Contents                                                                      |
| ------------------------ | ----------------------------------------------------------------------------- |
| `trophy_rank_exclusions` | Private holder exclusions, initially the four house and organisation accounts |
| `user_net_worth_peaks`   | Private positive nightly high and the time it was reached                     |
| `trophy_ranks`           | Public current holders, values, ranks and a single publication timestamp      |
| `user_trophy_rank_peaks` | Public best numeric rank, first ranked time and time of the best rank         |

The job publishes held ranks and updates personal bests in one transaction. `get-user-trophies` reads ranks, peaks, claims, starter progress and pins in one snapshot.

## Onboarding and rewards

The three Getting Started ladders count market-days, distinct markets and distinct days among an account's first 500 bets. Each qualifying market-day needs at least M10 in non-API mana buys. Eligible accounts can collect the existing starter rewards and M25 for Newcomer, subject to the account's reward multiplier. The eligibility cutoff is 1 November 2026 on dev and disabled on prod. Everyone can claim Newcomer.

`claim-trophy` records payment in `user_trophy_rewards` in the same transaction as the payout. Admin unclaims preserve this record. Navigation and the Trophies tab share claim counts and unlock notifications. Missing badge art falls back to the milestone emoji. Rank prizes are separate work.

## Deploy

The existing trophy migrations, live trade counters and completed trade backfill are prerequisites. Run `backend/supabase/migrations/2026112501_user_reactions_comment_likes_idx.sql` (a concurrent index, outside a transaction), then `2026112502_trophy_ladders_v2.sql`. Deploy the API and main scheduler, then web. Held ranks first populate on a successful nightly run.
