# Trophies

The 12 main trophies have 106 milestones. The ten-step Spectrum runs from green through teal, blue, indigo, purple, pink, crimson, orange and gold to prismatic. Net Worth has nine steps and skips teal. Legacy Charity keeps six colours (green, blue, purple, crimson, gold and prismatic). Close Call has one step. The 11 Getting Started trophies have 23 additional milestones.

`common/src/trophies.ts` defines thresholds, titles, claim eligibility and pin rules. Claiming records the selected milestone and all lower ones in `user_trophy_milestones`. The records last. Each milestone pays its prize once (see [Prizes](#prizes)). Retired IDs are ignored. Keep IDs stable after launch. Milestone IDs use lower-case letters, digits and hyphens only.

**Net Worth** shows the highest tier covered by the latest portfolio snapshot, starting at M2,500 for Minnow and ending at M500,000 for Whale. It adds mana balance and investment value from the same snapshot and rounds down to whole mana. Investment value already accounts for position loans. The live stat uses the latest available snapshot at any age and is zero before the first one. A claim checks that value inside its transaction, with no holding period. A fresh snapshot (at most 72 hours old) can also raise the stored peak, both at claim time and in the nightly job.

A drop lowers the displayed Net Worth tier. A higher previous tier appears as history. Below Minnow, a pinned badge shows the best tier in grey with a **Best** label. Claims still count towards the showcase slots. Other claimed milestone badges last, including Prediction Streak, which measures the longest-ever streak.

**Account Age** uses UTC calendar anniversaries at signup, 1, 3, 6, 12 and 18 months, then 2, 3, 4 and 5 years. The live stat expresses completed months plus the elapsed fraction of the current month in years. A January 31 signup reaches one month on the last day of February at its signup time.

**Close Call** has one milestone: a streak freeze saved your streak. The nightly `reset-betting-streaks` job adds one to `users.data.streakFreezesUsed` in the same update that uses the freeze, so saves from before that job's deploy don't count. The trophy has no nightly title.

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
- The portfolio writer reads positions before it reads cash. A sale between those reads can put both the sold position and its proceeds in one snapshot, inflating Net Worth. During the manual review of the top 25, check each holder's sales against their snapshot time. A Net Worth prize or rank title prize paid on such a snapshot is kept.
- The writer updates its in-memory portfolio before the history insert succeeds. If the insert fails and the portfolio stays the same on the next run, the writer can advance `last_calculated` on the old row. Stale values can then pass the 72-hour freshness check for peak recording and ranks.
- Two legacy multiple-choice markets in production have `isResolved` set in their data and a null contract `resolution`. Profitable Markets skips both, so profitable holders receive no credit for either market.
- The nav count and unlock toasts cover milestones that are reached and unclaimed. A milestone claimed before prizes existed has a prize to collect, and only its trophy card says so.
- A prize's membership days count towards the 30-day cap on free days held (`MAX_FREE_MEMBERSHIP_HELD_MS`). Whatever doesn't fit is lost: the grant is cut short, or recorded as capped. One whole ladder pays 30 days (18 of Plus and 12 of Pro), so an account collecting several ladders at once keeps the first 30 days. Free days already running open the cap by only the time that has passed. With under an hour of room no grant is made (`MIN_GRANT_ROOM_MS`), so a prize is never cut to a grant of minutes. Within one claim the best tier is granted first.
- Mega pays 30 Premium days and Super 14 Pro days. An account that reaches Mega before it was paid for Super is granted Mega first, which fills the cap, so Super's days are recorded as capped. An account already holding 30 free days gets neither.
- A milestone that pays mana or freezes as well as membership days is recorded as paid for a bonus-blocked account, which gets no membership days. Those days are not paid later if its standing improves. A milestone it would get nothing from stays unpaid and can be collected later.
- A grant of three days or fewer that starts at once sends the "free days ending" notice at once (membership grants rule).
- Rank title prizes arrive with no notification of their own.
- The scheduler's freeze and balance changes reach an open browser through the membership relay, which doesn't carry the freeze count. Rank title prizes pay no freezes today.

## Onboarding

The Getting Started trophies are for new accounts only. `getStarterStats` counts their stats live, on profile views and claims.

| Trophy           | Milestones                                                                  | Stat                                                                                                         |
| ---------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| First Trades     | First Trade 1, Hat Trick 3, High Five 5, Getting Going 10, In the Groove 25 | Market-days whose buys add up to M10 or more                                                                 |
| Markets Explored | Curious 3, Explorer 10, Globetrotter 25, Cartographer 50                    | Distinct markets among those market-days                                                                     |
| Days Active      | Back Again 2, Three Days 3, Five Days 5, Full Week 7, Ten Days 10           | Distinct Pacific days among them                                                                             |
| Wins             | Called It 1, Hot Hand 3                                                     | Resolved mana markets with a profit: the Profitable Markets rule, less markets the account created           |
| Topics           | Pick Your Topics 3                                                          | Topics followed                                                                                              |
| First Sale       | First Sale 1                                                                | Market-days whose sells add up to M10 or more                                                                |
| Limit Order      | Limit Order 1                                                               | Limit orders of M10 or more, filled or not. Slippage-protected buys (silent orders) don't count              |
| Stay in the Loop | Stay in the Loop 1                                                          | A push token on the account, or the old push notification bonus                                              |
| First Question   | First Question 1                                                            | Public mana markets the account created with at least 5 traders, excluding polls and bounties                |
| Bring a Friend   | Bring a Friend 1                                                            | People who signed up with the account's referral. The person rules for likers and qualifying referrals apply |
| Member           | Member 1                                                                    | A `MEMBERSHIP_PAYMENT` from the account. Free membership days pay nothing, so they don't count               |

The bet stats (trades, markets, days, sales and limit orders) read the account's first 500 bets and orders. Only those placed in mana markets and not via the API count, but API bets and bets in other currencies still use up the 500. Arbitrage legs, redemptions and automatic full-set redemptions (`isAutoRedemption`) don't use it up and never count, but the read stops after 3,000 rows in all. Activity after either limit doesn't count, so a first sale or limit order placed later earns nothing, and the Next trophy card can keep asking for one. The other counts stop at their top milestone: Wins shows at most 3.

Accounts with these trophies no longer get the M1,000 push notification bonus from `set-push-token`. Stay in the Loop replaces it. Other accounts still do. An account that was paid that bonus before (a `PUSH_NOTIFICATION_BONUS` transaction) can still claim Stay in the Loop, but `claim-trophy` pays it no mana for the milestone, only the freeze. The trophy card can't tell and still shows the mana.

Prizes are in the Prizes section below. The eligibility cutoff is 1 November 2026 on dev and disabled on prod. Everyone can claim Newcomer.

Navigation and the Trophies tab share claim counts and unlock notifications. Missing badge art falls back to the milestone emoji.

`get-user-trophies` is public. It returns `pushEnabled` and `paidMembership` as they are only to the account's owner (`preferAuth`, so the page waits for sign-in). Anyone else gets what the account's claims already show: 1 once Stay in the Loop or Member is claimed, otherwise 0 (`getPublicStarterStats`). The page keeps what it was sent per profile and per viewer (`web/hooks/user-trophies-store.ts`), so a sign-in, a sign-out or an account switch reads the profile again as the new viewer.

## Prizes

`common/src/trophy-prizes.ts` holds the prize table. A prize can mix mana, streak freezes and free membership days.

| Source                               | Prize                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Lifetime milestone                   | By tier colour (`LIFETIME_PRIZES_BY_TIER`), the same in every ladder                           |
| Leagues, Account Age, Legacy Charity | The colour's prize with its mana swapped for one streak freeze                                 |
| Getting Started milestone            | Its own entry in `MILESTONE_PRIZES`                                                            |
| Prediction Streak, Close Call        | Their own entries in `MILESTONE_PRIZES`                                                        |
| Newcomer                             | M50 for an account that gets the starter trophies, one freeze for everyone else                |
| Rank title                           | `RANK_TIER_PRIZES`: Super and Mega, once each per trophy. The #1 crown has no prize of its own |

Every account collects prizes except bots and the accounts in `BANNED_TRADING_USER_IDS` (banned from trading before `user_bans` existed, so they have no ban row). Those can claim, and are paid nothing. A milestone pays once per account, ever. Claiming a milestone also pays the unpaid ones below it. Net Worth pays a tier only while the account is at or above it.

Standing follows `getPrizeStanding`, from the account's effective tier at the time it is paid:

| Standing                              | Mana | Freezes | Membership days |
| ------------------------------------- | ---- | ------- | --------------- |
| Paid member, or any unflagged account | 1x   | Yes     | Yes             |
| Bonus-blocked (`reduced`)             | 0.2x | Yes     | No              |
| Flagged (`restricted`)                | 0    | No      | No              |

Membership pays no more than 1x. A membership the account pays for counts ahead of a flag or a bonus block, as it does for other bonuses. Free membership days don't (`resolveTrophyPrizeTier`): prizes pay free days, and a flagged account holding some would otherwise collect in full and keep itself topped up. A paid membership set aside while free days run still counts, including in the gap after those days run out and before the scheduler restores it, when no entitlement is active. Quests, streaks and referrals still treat free days as a membership. A milestone that would pay the account nothing is not recorded, so it can be collected later.

Freezes go to `users.data.streakForgiveness` with no cap. The shop's limit applies to purchases only. Free membership days keep every benefit.

Member (`starter-membership`) pays seven days of the tier the account pays for. Free days don't count as a paid membership. While free days run, the paid membership waits in the grant's `paused_paid`, and it counts while it has paid time left. With no paid membership the prize stays unpaid and can be collected once there is one.

### Collecting on a milestone claimed earlier

A milestone claimed before prizes existed, or left unpaid by the account's standing, shows Collect. For every trophy but Net Worth, `claim-trophy` then skips the stat check: the stat may have dropped since the claim (a deleted market, a lost referral), and the claim stands. It pays the unpaid prizes of the claimed milestones at or below the one asked for, and never claims or pays an unclaimed one. Net Worth keeps its check of the current snapshot. A milestone not claimed yet keeps the stat check. Raising the threshold of a shipped milestone ID would let old claims collect the new prize, so don't.

### How a prize is paid

`user_trophy_rewards` has one row per prize paid, keyed by user, trophy and milestone. No API path deletes a row, and an admin unclaim keeps it. `2026112801_trophy_prizes.sql` adds what each row paid: mana, freezes, the effective tier, and the membership tier, days, status (`none`, `pending`, `granted` or `skipped`), outcome, grant ID, and the retry count and next retry time. Rows from before it keep null mana and freezes. Their amount is on the transaction in `txn_id`.

`claim-trophy` locks the user's row, inserts the claims, then inserts the reward rows with `on conflict do nothing`. It pays only the rows it inserted, in the same transaction: one `TROPHY_REWARD` transaction for the mana and one update for the freezes. Membership days are written as `pending`. The balance and freeze count are broadcast after commit.

Membership days are granted after commit, outside the transaction and the bet queue, because `grantMembershipDays` takes the user's bet queue slot and its own transaction. Each grant uses source `trophy` and source ID `<trophy>/<milestone>`, so repeating it returns the first grant. The row then records `granted` and the outcome:

| Outcome     | Meaning                                                        |
| ----------- | -------------------------------------------------------------- |
| `started`   | The days are running                                           |
| `banked`    | Saved. They start when the account's current membership allows |
| `capped`    | The 30-day cap left nothing, or under an hour of room          |
| `duplicate` | An earlier attempt made the grant, and it has since ended      |

An account's pending rows are granted best tier first. A grant that fails leaves its row `pending` and stops the pass for that account, so a lesser prize can't take the room under the cap that a better one is owed. Three paths retry, and all are safe to repeat:

1. Every later claim by the account settles its pending rows before answering.
2. The main scheduler's `settle-trophy-prizes` job runs every two minutes. It takes up to 100 accounts with a pending row that is due, oldest first, and settles all their pending rows. A row is due one minute after it was written. After a failed pass the account waits 2, 4, 8 minutes and so on, up to 6 hours, and each failure is logged as an error. The job asks the API to broadcast a membership it started, as the membership grant job does.
3. The nightly rank job settles the accounts it pays, and any holder with a title prize still pending from an earlier night.

The account is checked again for every pending part, since the grant can come minutes or hours after the prize was judged. The check is `grantMembershipDays`' `precondition`: it runs inside the grant's own transaction, after the wait for the user's queue slot, so nothing can land between the check and the grant. A bot, a deleted account, one in `BANNED_TRADING_USER_IDS`, one with a ban that stops a claim (posting or trading), or one whose standing no longer allows membership days has the part recorded as `skipped` and gets no grant. A rank title part uses the rank job's rules instead: any ban but a mod alert, and `trophy_rank_exclusions`. `skipped` is final. A grant an earlier attempt already made is still recorded as it is.

`claim-trophy` returns `prize: { mana, freezes, membership: [{ tier, days, grantedDays, outcome }] }` beside `rewardAmount`. `outcome` can also be `pending` (still to be granted) or `skipped` (not granted: days of a paid tier the account doesn't have, or an account that could no longer be paid). `rewarded` lists paid milestones for every account, in `claim-trophy` and `get-user-trophies`.

### Rank title prizes

After `update-trophy-ranks` publishes, it pays each account whose best rank on a ranked trophy has reached Super (top 25) or Mega (top 5) and has no row for that title yet. Mega also pays Super. The same person and exclusion rules as the ranks apply, checked again under the user's row lock, and the same standing rules. An account whose standing leaves the prize empty is not recorded, and a later run pays it once its standing allows.

The rows share `user_trophy_rewards`, with the ranked trophy in `trophy_id` and `rank:super` or `rank:mega` in `milestone_id`. The colon keeps them apart from milestone IDs. Their grants use source `trophy-rank` and source ID `<trophy>/<super|mega>`. `rewarded` leaves them out.

The first run after deploy pays every best rank already recorded. A failure while paying is logged and leaves the ranks published. The next run pays what is still owed.

## Deploy

The existing trophy migrations, live trade counters and completed trade backfill are prerequisites. Run `backend/supabase/migrations/2026112501_user_reactions_comment_likes_idx.sql` (a concurrent index, outside a transaction), then `2026112502_trophy_ladders_v2.sql`. Deploy the API and main scheduler, then web. Held ranks first populate on a successful nightly run.

For prizes, free membership days must be live first: `2026112503_membership_grants.sql` applied and every API instance grant-aware (see `dev-docs/membership-grants.md`). Then:

1. Run `2026112801_trophy_prizes.sql`. It adds nullable columns, two check constraints and a small partial index, under a five-second lock timeout. Rerun it if the lock times out.
2. Deploy the API. Until then the old API keeps working and pays no prizes.
3. Deploy the main scheduler (`settle-trophy-prizes` and the rank title prizes).
4. Merge web. Web deploys on merge, so the API must be live first: the new page asks every account to collect, and an older API would pay nothing.

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
