# Trophy System — Implementation Plan

**Branch:** `trophies` (on upstream)
**Last updated:** 2026-03-13

---

## What's Done (Stages 1-3 complete + polish)

### Stage 1-2: Core trophy system (2 initial commits)
- 11 trophy definitions with uniquely named milestones in 4 categories
- Trophy card UI with tier navigation, colored dots, progress bars
- Profile showcase: pin up to 3 trophy badges to profile header
- Trophies tab on profile page

### Stage 3: Server-side claims + pins
- `user_trophy_claims` and `user_showcase` DB tables with RLS
- `claim-trophy` endpoint (per-tier claiming, downgrade protection)
- `unclaim-trophy` endpoint (admin-only)
- `set-showcase-pins` endpoint
- Server-backed pins with localStorage migration
- Optimistic UI updates

### Polish (post-Stage 3)
- Trophy descriptions on each card
- Trophies tab header explainer
- Per-tier claiming: each milestone claimed individually, claiming higher auto-claims lower
- Claim button shows per-viewed-tier (not global)
- "Claimed" checkmark on all tiers at or below claimed level
- Only claimed trophies appear in showcase badge picker
- "+ Pin" button visible on own profile even with no claims
- Newcomer trophy claimable on signup (threshold 0)
- Dev stat override panel for testing
- Admin unclaim tool

---

## Database Schema

```sql
-- Permanent claimed milestones (claim once, keep forever)
-- Stores highest claimed milestone per trophy per user.
-- All milestones at or below the stored one are implicitly claimed.
CREATE TABLE user_trophy_claims (
    user_id    text         NOT NULL REFERENCES users(id),
    trophy_id  text         NOT NULL,
    milestone  text         NOT NULL,   -- highest claimed milestone name
    claimed_at timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, trophy_id)
);

-- Display preference: up to 3 pinned badge IDs on profile header.
CREATE TABLE user_showcase (
    user_id    text    PRIMARY KEY REFERENCES users(id),
    pins       text[]  NOT NULL DEFAULT '{}',
    updated_at timestamptz NOT NULL DEFAULT now()
);
```

---

## Trophy Definitions (in common/src/trophies.ts)

**Trading:**
- Trading Volume: Minnow (100K) -> Big Fish (500K) -> Shark (2M) -> Orca (10M) -> Whale (50M) -> Leviathan (200M)
- Trades Placed: Dabbler (50) -> Regular (250) -> Hustler (1K) -> Machine (5K) -> Terminator (25K) -> Singularity (100K)
- Prediction Streak: Spark (14d) -> Ember (30d) -> Blaze (60d) -> Inferno (100d) -> Phoenix (200d) -> Eternal Flame (365d)
- Profitable Markets: Lucky (10) -> Sharp (50) -> Oracle (200) -> Clairvoyant (500) -> Omniscient (1K)

**Creating:**
- Markets Created: Apprentice (5) -> Builder (25) -> Architect (100) -> City Planner (500) -> World Builder (1K)
- Creator Popularity: Unknown (50) -> Notable (250) -> Famous (1K) -> Legendary (5K) -> Celebrity (10K)

**Social:**
- Comments: Chatterbox (50) -> Debater (250) -> Pundit (1K) -> Influencer (5K) -> Voice of the People (10K)
- Referrals: Networker (5) -> Recruiter (25) -> Ambassador (100) -> Evangelist (250)
- Charity Donations: Donor (1K) -> Patron (10K) -> Philanthropist (50K) -> Benefactor (250K) -> Saint (1M)

**Prestige:**
- Masters Seasons: Contender (1) -> Champion (3) -> Dynasty (5) -> GOAT (8)
- Account Age: Newcomer (0yr) -> Established (2yr) -> Veteran (3yr) -> Elder (4yr) -> Founding Member (5yr)

---

## Remaining Stages

### Stage 4: Celebrations

Notification toasts when milestones are newly reached. Confetti + milestone display.

| File | Action |
|------|--------|
| web/components/trophies/trophy-celebration.tsx | Create — confetti + milestone display |
| web/hooks/use-trophy-milestones.ts | Create — detect newly claimable milestones |
| web/pages/[username]/index.tsx | Wire up celebration on first visit after new milestone |

### Stage 5: Claim Rewards (non-mana)

Tangible rewards when claiming milestones, designed to avoid mana inflation.

**Subscription days:**
- Claiming a milestone grants days of Plus membership
- If already subscribed: days stack onto current billing period end date
- If on higher tier (Pro): days still add to current plan
- Serves as acquisition funnel — users who taste Plus features are more likely to subscribe

**Streak freezes:**
- Earn freezes that prevent your betting streak from breaking on missed days
- Thematic fit with prediction streak trophy, but awarded across all trophies
- Needs: `streak_freezes` column on users, logic in streak calculation, UI indicator

**Cosmetic unlocks (future):**
- Specific emoji reactions, profile effects, card borders tied to trophies
- Zero economic impact, pure status

**Reward schedule by tier:**

| Tier | Reward |
|------|--------|
| Green | 1 streak freeze |
| Blue | 2 days Plus |
| Purple | 3 days Plus + 1 streak freeze |
| Crimson | 5 days Plus |
| Gold | 7 days Plus + 2 streak freezes |
| Prismatic | 14 days Plus + 3 streak freezes |

**Implementation:**
- Add `reward` field to `TrophyMilestone` type (optional, per-tier)
- `claim-trophy` endpoint grants rewards on successful claim
- Subscription extension: call existing billing logic to add days
- Streak freezes: new column + consumption logic in streak scheduler
- UI: show reward preview on unclaimed milestones, celebration on claim

### Stage 6: Trophy Expansion

New trophy types beyond the core stat-based ones:

**Leaderboard trophies (free first, paid later):**
- Category-specific rankings: "#X in AI Creators", "#Y in Politics Profit"
- User selects a category to display their rank
- Single-tier, dynamically updating stat display
- Start free, potentially gate behind purchase later

**Shop trophies:**
- Purchasable trophies (e.g. "Mr Moneybags" for spending mana in the shop)
- Trophy for total mana spent in shop

**Subscription trophies:**
- Trophy tiers for time spent as a subscriber

**Review rating trophies:**
- Trophy tiers for your review/calibration rating

**Design:** All new trophies use the same `TrophyDefinition` format — easily expandable by adding entries to `TROPHY_DEFINITIONS` array. Some may be single-tier (1 milestone). Shop/subscription trophies may need new `statKey` sources in `get-user-achievements`.

### Stage 7: Gifted Titles

Titles like "Sniper", "Legend", "God Creator" — bought by OTHER users for you, can't self-buy.
Pin IDs use format "title-sniper" etc., stored in user_showcase.pins alongside trophy pins.

| File | Action |
|------|--------|
| common/src/trophies.ts | Title definitions |
| backend/api/src/gift-title.ts | Create endpoint |
| common/src/api/schema.ts | Add route |
| web/components/trophies/gift-title-modal.tsx | Create modal |
| web/pages/[username]/index.tsx | Gift button on others' profiles |

### Stage 8: Custom Art + Visual Polish

Replace emoji placeholders with custom artwork per milestone. Animations scale with tier importance.

- Add `imageUrl` / `artAsset` optional field to `TrophyMilestone`
- Update rendering in trophy-card.tsx and profile-showcase.tsx (~2 spots each)
- CSS/Lottie animations keyed by tier (shimmer on crimson+, rainbow on prismatic)
- Card entrance transitions, hover effects
- Animated pins on profile showcase

---

## Architecture

Data flow:
1. `get-user-achievements` API returns 20+ stat fields + ranks + `claimedTrophies[]` + `showcasePins[]`
2. Client calls `computeAllTrophyProgress(stats)` → ComputedTrophyProgress[]
3. Client compares computed progress against `claimedTrophies` to determine claimable milestones
4. TrophyCard renders each with per-tier navigation, progress bars, and per-tier "Claim" buttons
5. ProfileShowcase renders pinned badges from server-stored `showcasePins` (only claimed trophies)
6. Pin/unpin → `set-showcase-pins` API. Claim → `claim-trophy` API (with milestone param).

## Design principles:
- Work backwards from the pin — every trophy should be something people want to show off
- Each tier has its own NAME (Minnow/Shark/Whale), not color grades
- Claim once, keep forever — milestones are permanent even if stats drop
- Per-tier claiming: users choose when to claim each milestone level
- No unnecessary backend — compute eligibility client-side, server only validates + persists
- Don't bloat the users table — separate tables for claims and pins
- Easily expandable: new trophies = new entries in TROPHY_DEFINITIONS array
