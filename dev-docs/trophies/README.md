# Trophies

Named milestones on a user's long-running stats, such as Goldfish → Shark → Whale for trading volume. A user claims a milestone once they reach it, keeps it forever, and can pin trophies to their profile.

The full product plan, including how trophies fit new-user onboarding and the reward amounts still to be decided, is the Notion page "New-user mana, bailouts and trophies: onboarding plan" in the Claude containment zone. This file describes the code.

## How it works

| Piece | Where |
| --- | --- |
| Trophy and milestone definitions, progress, claim and pin rules (pure, shared) | `common/src/trophies.ts`, tests in `common/src/trophies.test.ts` |
| Stats a trophy measures | `get-user-achievements` (`backend/api/src/get-user-achievements.ts`), unchanged by trophies |
| Claims and pins | `get-user-trophies`, `claim-trophy`, `set-showcase-pins`, admin `unclaim-trophy` in `backend/api/src/` |
| Tables | `user_trophy_milestones`, `user_showcase` (`backend/supabase/migrations/2026112210_trophy_milestones.sql`) |
| UI | `web/components/trophies/`: Trophies tab on the profile, profile showcase under the name |

Data flow:

1. The profile fetches the user's stats (`get-user-achievements`, cached briefly) and their claims and pins (`get-user-trophies`, not cached). `web/hooks/use-user-trophies.ts` shares the second between the tab and the showcase.
2. The web works out progress from the stats with the shared helpers, so it shows the same answer the server will give.
3. Claiming a milestone calls `claim-trophy`. The server reloads the stats, checks the milestone is reached, and inserts one row per milestone, the requested one and every lower one. The primary key `(user_id, trophy_id, milestone_id)` makes repeats and concurrent claims harmless, and a claim can never be lowered.
4. Pinning calls `set-showcase-pins`. The server checks each pin is a claimed trophy (`trophy-<id>`) or the league badge (`league`), and that the user has unlocked that many slots: one at the start, two at 25 claimed milestones, three at 50.

Both write endpoints run through `onlyUsersWhoCanPerformAction`: claiming is blocked by a posting or trading ban, pinning by a posting ban.

Ids are stored in the database. Never change a trophy's or milestone's `id`; change its `name` instead. Claims of an id that no longer exists are ignored.

## Stages

Each stage is its own PR.

| Stage | What | State |
| --- | --- | --- |
| 1 | Trophies v1, cosmetic: per-milestone claims, server-checked claims and pins, emoji badges | This code |
| 1b | Fresh trade counts: the `ach_trades` refresh job stopped in Sep 2025 | Separate PR off main |
| 2 | Starter milestones for new users that pay mana once each, behind a flag | Next |
| 3 | A notification when a trophy is ready to claim, a celebration on claim, a "next trophy" card | Planned |
| 4 | Days of Plus membership as rewards, never auto-renewing | Needs a product decision |
| 5 | Badge art (`art-guide.md`, `badge-prompts.txt`, `composite-badge.ts`) | Needs a product decision |

Ideas from the March plan kept for later: streak freezes as rewards (they already exist as a shop item, so a reward adds one to the user's count), leaderboard and subscription trophies, gifted titles that only other users can buy you, and animations that scale with tier.

## Design principles

From the original plan, still true:

- Work backwards from the pin: every trophy should be something people want to show off.
- Each milestone has its own name (Minnow, Shark, Whale), not a colour grade.
- Claim once, keep forever, even if the stat later drops.
- Adding a trophy is adding an entry to `TROPHY_DEFINITIONS`.

## Deploy

Migration on dev, then prod, then the API, then web. The old design's `user_trophy_claims` table exists on dev only and is no longer read; drop it there by hand if wanted.
