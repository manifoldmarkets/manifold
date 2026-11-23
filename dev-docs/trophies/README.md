# Trophies

Named milestones on a user's long-running stats, such as Goldfish → Shark → Whale for trading volume. A user claims a milestone once they reach it, keeps it forever, and can pin trophies to their profile.

The full product plan, including how trophies fit new-user onboarding and the reward amounts still to be decided, is the Notion page "New-user mana, bailouts and trophies: onboarding plan" in the Claude containment zone. This file describes the code.

## How it works

| Piece                                                                          | Where                                                                                                                                |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Trophy and milestone definitions, progress, claim and pin rules (pure, shared) | `common/src/trophies.ts`, tests in `common/src/trophies.test.ts`                                                                     |
| Stats a trophy measures                                                        | `get-user-achievements` (`backend/api/src/get-user-achievements.ts`), unchanged by trophies                                          |
| Claims and pins                                                                | `get-user-trophies`, `claim-trophy`, `set-showcase-pins`, admin `unclaim-trophy` in `backend/api/src/`                               |
| Tables                                                                         | `user_trophy_milestones`, `user_showcase` (migrations `2026112210_trophy_milestones.sql`, `2026112211_trophy_milestone_rewards.sql`) |
| UI                                                                             | `web/components/trophies/`: Trophies tab on the profile, profile showcase under the name                                             |

Data flow:

1. The profile fetches the user's stats (`get-user-achievements`) and their claims and pins (`get-user-trophies`). `web/hooks/use-user-achievements.ts` and `web/hooks/use-user-trophies.ts` share them between the tab and the showcase, so both always agree. Stats are read again on each visit once they are 30 seconds old, and when the page regains focus.
2. The web works out progress from the stats with the shared helpers, so it shows the same answer the server will give.
3. Claiming a milestone calls `claim-trophy`. The server reloads the stats, checks the milestone is reached, and inserts one row per milestone, the requested one and every lower one. The primary key `(user_id, trophy_id, milestone_id)` makes repeats and concurrent claims harmless, and a claim can never be lowered. Only the admin `unclaim-trophy` deletes claim rows, after which a milestone can be claimed anew: anything paid for a claim must be recorded in a table that is never deleted (stage 2's `user_trophy_rewards`), not keyed to the claim row.
4. Pinning calls `set-showcase-pins`. The server checks each pin is a claimed trophy (`trophy-<id>`) or the league badge (`league`), and that the user has unlocked that many slots: one at the start, two at 25 claimed milestones, three at 50.

Both write endpoints run through `onlyUsersWhoCanPerformAction`: claiming is blocked by a posting or trading ban, pinning by a posting ban. Both also take the profile's `userId` and refuse it unless it is the signed-in user, so a session that switched accounts after the page loaded can't change the wrong account.

Visitors see only the milestones the owner has claimed; the owner sees everything they have reached.

## Onboarding trophies and rewards

The onboarding milestones are Newcomer (the first Account Age milestone) and every milestone of First Trades, Markets Explored and Days Active. Each has a base mana reward (`rewardMana`). Newcomer's base reward is M25.

- **Eligibility:** accounts created at or after `STARTER_TROPHIES_START_TIME` in `common/src/trophies.ts` get the three starter trophies and onboarding rewards. The cutoff is 1 Nov 2026 on dev. On prod it is `null`, disabling both. Everyone can still claim Newcomer. Older accounts receive no mana or reward row, including when claiming Newcomer through a higher Account Age milestone.
- **What counts:** market-days among the account's first 500 bets. A market-day is a market and Pacific day in which the account's buys, not via the API and in a mana market, add up to M10 or more, so a purchase split across answers counts and selling and buying the same market again that day doesn't. A limit order counts on the day it was placed, once its fills reach M10. `get-user-trophies` counts these live (`getStarterStats` in `backend/api/src/helpers/trophies.ts`), and only for those accounts.
- **Paying once:** `claim-trophy` locks the user row and, in one transaction, records the claims, inserts one row per paying milestone into `user_trophy_rewards`, and pays only for the rows it inserted (`TROPHY_REWARD` txn from the bank). Nothing deletes reward rows, so a repeat or concurrent claim, an admin unclaim followed by a new claim, or a deploy that briefly runs older code alongside cannot pay a milestone twice. A failed payout rolls the claim back. Deletion and bans are checked again under the lock; bot accounts are never paid.
- **Payouts** use the printed amount for free, Plus, Pro and Premium accounts. Someone who claims before buying a membership receives the same amount as someone who waits. Without an active membership, flagged accounts receive zero and bonus-blocked accounts receive 20% of the printed reward. Membership takes precedence over a flag. A zero payout leaves the reward unpaid. If the account's standing improves, the card shows "Collect" and calls `claim-trophy` again. The "Pays" chip shows the viewer's own amount and hides when it would be zero or has been paid.
- **Known limits:** automation through a signed-in browser session isn't marked as API, and the same M10 can be bought and sold across different markets and days. Each account can collect at most M875 at the placeholder amounts, including Newcomer. A ban committed in the milliseconds between the claim's ban check and its payout doesn't stop that payout. An account that places 500 bets before its seventh active day can't reach Full Week, because only the first 500 bets are counted.
- **Tests:** `backend/shared/src/claim-trophy.test.ts` runs the real handlers and payout against an in-memory PostgreSQL built from the migrations.

For starter accounts, the desktop and mobile profile links show the number of onboarding milestones ready to claim. A single loader in `Page` shares the profile's trophy store, reuses fresh data across navigation and checks for newly reached milestones after a bet. The profile tab counts all claimable milestones. On the owner's tab, onboarding claims appear first, followed by a next goal once those claims are collected. A paid claim or the first claim opens a celebration. The first celebration leads to the trophy explainer, which also opens from the tab header.

To switch on for prod: set the amounts, set `STARTER_TROPHIES_START_TIME.PROD` to the launch time, then deploy the API and web. To switch off: set it back to `null` and deploy the API (claims already made stay paid).

Ids are stored in the database. Never change a trophy's or milestone's `id`; change its `name` instead. Claims of an id that no longer exists are ignored.

## Stages

Each stage is its own PR.

| Stage | What                                                                                                                                                                                  | State                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1     | Trophies v1, cosmetic: per-milestone claims, server-checked claims and pins, emoji badges                                                                                             | Built                    |
| 1b    | Live trade counts and volume: `user_stats`, kept by triggers on `contract_bets` (the `ach_trades` refresh job stopped in Sep 2025). Trades Placed reads a frozen count until it ships | Separate PR off main     |
| 2     | "Getting started" milestones for new accounts that pay mana once each, off on prod                                                                                                    | Built                    |
| 3     | Onboarding claim badges, Newcomer reward, post-bet notifications, next trophy and claim celebration                                                                                   | Built                    |
| 4     | Days of Plus membership as rewards, never auto-renewing                                                                                                                               | Needs a product decision |
| 5     | Badge art: one image per milestone, made by GPT image generation, 256 px WebP in `web/public/trophy-badges/`, emoji fallback (`art-guide.md`)                                         | Built                    |

Ideas from the March plan kept for later: streak freezes as rewards (they already exist as a shop item, so a reward adds one to the user's count), leaderboard and subscription trophies, gifted titles that only other users can buy you, and animations that scale with tier.

## Design principles

From the original plan, still true:

- Work backwards from the pin: every trophy should be something people want to show off.
- Each milestone has its own name (Minnow, Shark, Whale), not a colour grade.
- Claim once, keep forever, even if the stat later drops.
- Adding a trophy is adding an entry to `TROPHY_DEFINITIONS`.

## Deploy

**Before the Trophies tab goes live:** the live trade counts (`user_stats`, branch `feat/live-user-stats`) must be deployed and their backfill complete. Until then Trades Placed reads `ach_trades`, frozen since Sep 2025, so anyone who joined since shows 0 trades.

Then the migration on dev, then prod, then the API, then web. The old design's `user_trophy_claims` table exists on dev only and is no longer read; drop it there by hand if wanted.
