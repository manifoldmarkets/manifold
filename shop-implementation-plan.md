# Manifold Shop - Implementation Plan & Roadmap

**Last Updated:** February 24, 2026
**Branch:** `shop-items2`

This document tracks implemented features, planned work, and audit remediation. For current system documentation, see `SHOP_SYSTEM.md`.

---

## Table of Contents

1. [Entitlement Display Configuration](#entitlement-display-configuration) - ✅ Implemented
2. [Charity Champion Trophy System](#charity-champion-trophy-system) - ✅ Implemented
3. [Printful Merch Integration](#printful-merch-integration) - ✅ Implemented
4. [Achievement-Gated Items](#achievement-gated-items) - ✅ Implemented
5. [Audit Remediation](#audit-remediation) - 🔧 In Progress
6. [Future: Merch Background](#future-merch-background) - 📋 Planned

---

## Entitlement Display Configuration

**Status:** ✅ Implemented (January 2026)

Centralized configuration system controlling which entitlements (avatar decorations, badges) and animations are shown in each display area.

**Full documentation moved to:** `SHOP_SYSTEM.md` → "Entitlement Display Configuration" section

### Quick Reference

- **Config file:** `common/src/shop/display-config.ts`
- **Key components:** `Avatar`, `UserLink`, `UserBadge`, `UserAvatarAndBadge`, `StackedUserNames`
- **Data hook:** `useDisplayUserById` (for areas with only userId)

### Known Limitations (Future Work)

| Area | Issue | Solution |
|------|-------|----------|
| browse/explore/feed | Contract cards only have `creatorId`, not entitlements | Use `useDisplayUserById(creatorId)` |
| notifications | Notification data doesn't include entitlements | Accept limitation or modify API |
| System badges | Staff/mod/MVP badges not controlled by config | Future: unify with display config |

---

## Charity Champion Trophy System

**Status:** ✅ Implemented and live on `shop-items2`

A special "earned" item that cannot be purchased - only the #1 ticket buyer in the charity raffle can claim it.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SHOP PAGE (shop.tsx)                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  useAPIGetter('get-charity-giveaway')  ← Single API call            │   │
│  │           ↓                                                          │   │
│  │    charityGiveawayData (shared state)                               │   │
│  │           ↓                        ↓                                 │   │
│  │  ┌─────────────────┐    ┌─────────────────────────┐                 │   │
│  │  │ GiveawayCard    │    │ ChampionCard            │                 │   │
│  │  │ (data prop)     │    │ (data prop + user)      │                 │   │
│  │  └─────────────────┘    └─────────────────────────┘                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BACKEND API LAYER                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  get-charity-giveaway.ts                                            │   │
│  │  ├── Returns: giveaway, champion, trophyHolder, winner, etc.       │   │
│  │  └── Runs 4 parallel DB queries via Promise.all()                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  claim-charity-champion.ts                                          │   │
│  │  ├── Validates caller is #1 ticket buyer                           │   │
│  │  ├── Revokes trophy from previous holder                           │   │
│  │  └── Grants/updates entitlement for new champion                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            DATABASE TABLES                                   │
│  ┌─────────────────────────┐    ┌─────────────────────────────────────┐    │
│  │ charity_giveaway_tickets│    │ user_entitlements                   │    │
│  │ (ticket purchases)      │    │ (trophy ownership)                  │    │
│  └─────────────────────────┘    └─────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Concepts

| Term | Definition | Storage |
|------|------------|---------|
| **Champion** | User with most total tickets in current raffle | Computed dynamically from `charity_giveaway_tickets` |
| **Trophy Holder** | User who claimed the trophy entitlement | Stored in `user_entitlements` with `enabled=true` |
| **Ticket Champion** | Same as Champion - displayed on giveaway card | Computed |

**Important:** Champion and Trophy Holder can be different people:
- Champion hasn't claimed yet
- Previous champion still holds trophy (new champion hasn't claimed)
- Trophy holder disabled their trophy display

### Files Reference

| Layer | File | Purpose |
|-------|------|---------|
| **Frontend** | `web/pages/shop.tsx` | Fetches data once, passes to both cards |
| **Frontend** | `web/components/shop/charity-giveaway-card.tsx` | Shows raffle info + "Ticket Champion" |
| **Frontend** | `web/components/shop/charity-champion-card.tsx` | Trophy card with claim/toggle UI |
| **Frontend** | `web/components/widgets/user-link.tsx` | `CharityChampionBadge` component |
| **Backend** | `backend/api/src/get-charity-giveaway.ts` | Main API - returns champion + trophyHolder |
| **Backend** | `backend/api/src/claim-charity-champion.ts` | Claim/toggle trophy API |
| **Backend** | `backend/api/src/routes.ts` | Route registration |
| **Common** | `common/src/api/schema.ts` | API types + `LIGHT_CACHE_STRATEGY` |
| **Common** | `common/src/shop/items.ts` | `CHARITY_CHAMPION_ENTITLEMENT_ID`, helpers |

### API Schema

```typescript
// GET /api/get-charity-giveaway (extended version)
returns: {
  giveaway?: { giveawayNum, name, prizeAmountUsd, closeTime, winningTicketId, createdTime }
  charityStats: { charityId, totalTickets, totalManaSpent }[]
  totalTickets: number
  winningCharity?: string
  winner?: { id, username, name, avatarUrl }
  champion?: { id, username, name, avatarUrl, totalTickets }      // ← #1 ticket buyer
  trophyHolder?: { id, username, name, avatarUrl, totalTickets, claimedTime }  // ← Has trophy
  nonceHash?: string
  nonce?: string  // Only revealed after winner selected
}

// POST /api/claim-charity-champion (NEW API)
props: { enabled?: boolean }  // Toggle trophy visibility
returns: { success: boolean, entitlements: UserEntitlement[] }
```

### Shop Item Definition

```typescript
// In common/src/shop/items.ts - add to SHOP_ITEMS array
{
  id: 'charity-champion-trophy',
  name: 'Charity Champion Trophy',
  description: 'Exclusive trophy for the #1 ticket buyer in the charity raffle',
  price: 0,           // Cannot be purchased
  type: 'earned',     // Special type - excluded from shop grid
  limit: 'one-time',
  category: 'badge',
}

// Helper function
export const userHasCharityChampionTrophy = (
  entitlements: UserEntitlement[] | undefined
): boolean => {
  return hasActiveEntitlement(entitlements, 'charity-champion-trophy')
}

// Constant
export const CHARITY_CHAMPION_ENTITLEMENT_ID = 'charity-champion-trophy'
```

Items with `type: 'earned'` are:
- Filtered out of the regular shop item grid (`item.type !== 'earned'`)
- Displayed in their own special cards
- Managed by custom claim APIs (not `shop-purchase`)

### Trophy Transfer Logic

When someone new becomes champion and claims:
1. Previous holder's entitlement is set to `enabled = false`
2. New champion gets the entitlement (or existing one updated to `enabled = true`)
3. Trophy badge moves to new holder's profile immediately

### claim-charity-champion.ts Implementation

```typescript
// backend/api/src/claim-charity-champion.ts
export const claimCharityChampion = async (
  props: { enabled?: boolean },
  auth: AuthedUser,
  pg: SupabaseDirectClient
) => {
  const { enabled = true } = props

  // 1. Get current champion (user with most tickets)
  const champion = await pg.oneOrNone<{ user_id: string; total_tickets: number }>(
    `SELECT user_id, SUM(num_tickets) as total_tickets
     FROM charity_giveaway_tickets
     WHERE giveaway_num = (SELECT MAX(giveaway_num) FROM charity_giveaways)
     GROUP BY user_id
     ORDER BY total_tickets DESC
     LIMIT 1`
  )

  // 2. Validate caller is the champion
  if (!champion || champion.user_id !== auth.uid) {
    throw new APIError(403, 'Only the #1 ticket buyer can claim the trophy')
  }

  // 3. Revoke from previous holder (if any)
  await pg.none(
    `UPDATE user_entitlements
     SET enabled = false
     WHERE entitlement_id = 'charity-champion-trophy' AND user_id != $1`,
    [auth.uid]
  )

  // 4. Grant/update entitlement for new champion
  await pg.none(
    `INSERT INTO user_entitlements (user_id, entitlement_id, enabled, granted_time)
     VALUES ($1, 'charity-champion-trophy', $2, NOW())
     ON CONFLICT (user_id, entitlement_id)
     DO UPDATE SET enabled = $2, granted_time = NOW()`,
    [auth.uid, enabled]
  )

  // 5. Return updated entitlements
  const entitlements = await getUserEntitlements(auth.uid, pg)
  return { success: true, entitlements }
}
```

### CharityChampionCard Component

```typescript
// web/components/shop/charity-champion-card.tsx
export function CharityChampionCard(props: {
  champion?: { id: string; username: string; name: string; avatarUrl: string; totalTickets: number }
  trophyHolder?: { id: string; username: string; name: string; avatarUrl: string; totalTickets: number; claimedTime: number }
  user: User | null | undefined
  onEntitlementsUpdate?: (entitlements: UserEntitlement[]) => void
}) {
  const { champion, trophyHolder, user, onEntitlementsUpdate } = props
  const [isLoading, setIsLoading] = useState(false)

  const isCurrentChampion = user && champion && user.id === champion.id
  const hasTrophy = user && trophyHolder && user.id === trophyHolder.id
  const canClaim = isCurrentChampion && !hasTrophy
  const canToggle = isCurrentChampion && hasTrophy

  const handleClaim = async () => {
    setIsLoading(true)
    try {
      const result = await api('claim-charity-champion', { enabled: true })
      onEntitlementsUpdate?.(result.entitlements)
      toast.success('Trophy claimed!')
    } catch (e) {
      toast.error('Failed to claim trophy')
    } finally {
      setIsLoading(false)
    }
  }

  // ... render card with trophy icon, holder info, claim/toggle buttons
}
```

### CharityChampionBadge Component

```typescript
// In web/components/widgets/user-link.tsx
export function CharityChampionBadge() {
  return (
    <Tooltip text="#1 Charity Champion">
      <FaTrophy className="text-amber-500 h-3.5 w-3.5 drop-shadow-sm" />
    </Tooltip>
  )
}

// Usage in UserLink:
{userHasCharityChampionTrophy(user.entitlements) && <CharityChampionBadge />}
```

### Performance Optimizations

1. **Single API call** - `shop.tsx` fetches once, passes data to both cards
2. **Parallel DB queries** - `get-charity-giveaway.ts` uses `Promise.all()` for 4 queries
3. **Light caching** - `LIGHT_CACHE_STRATEGY` reduces redundant API calls
4. **Loading skeletons** - Cards show skeleton UI while data loads

### To Re-implement

1. Add `'earned'` back to `ShopItemType` in `items.ts`
2. Add `charity-champion-trophy` item to `SHOP_ITEMS`
3. Add `userHasCharityChampionTrophy()` helper and `CHARITY_CHAMPION_ENTITLEMENT_ID`
4. Create `claim-charity-champion.ts` API
5. Update `get-charity-giveaway.ts` to return champion/trophyHolder
6. Add `claim-charity-champion` to routes.ts and schema.ts
7. Create `charity-champion-card.tsx` component
8. Update `shop.tsx` to filter earned items and show champion card
9. Add `CharityChampionBadge` to `user-link.tsx`

---

## Printful Merch Integration

**Status:** ✅ Implemented and live on `shop-items2`

Physical merchandise orders via Printful API.

### Database Schema (Already Created)

```sql
-- shop_orders table already supports this
CREATE TABLE shop_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  price_mana BIGINT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  txn_id TEXT,
  printful_order_id TEXT,     -- ← from Printful API
  printful_status TEXT,       -- ← synced from Printful
  status TEXT NOT NULL DEFAULT 'CREATED',
  metadata JSONB,             -- ← size, color, variant, etc.
  created_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  shipped_time TIMESTAMPTZ,
  delivered_time TIMESTAMPTZ
);
```

### Implementation Steps

1. **Shop items config** - Add items with `category: 'merch'` and `printfulProductId`
2. **Purchase flow** - Collect shipping info in modal, send directly to Printful API
3. **Order tracking** - Use `shop_orders.printful_order_id` and `printful_status`
4. **Status sync** - Webhook or polling to update order status from Printful
5. **No shipping storage** - Shipping info sent to Printful, not stored in our DB

### Item Configuration

```typescript
{
  id: 'manifold-tshirt',
  name: 'Manifold T-Shirt',
  description: 'Show your prediction market pride',
  price: 50000,  // M$50k
  type: 'physical',  // New type
  limit: 'unlimited',
  category: 'merch',
  printfulProductId: 'xxx',  // From Printful
  variants: ['S', 'M', 'L', 'XL'],
}
```

---

## Achievement-Gated Items

**Status:** ✅ Partially implemented — requirement checks live, some items gated

Items that require specific achievements to unlock before purchasing.

### Proposed Items

| Item | Requirement | Price |
|------|-------------|-------|
| Flame Border | 100-day betting streak | M$50,000 |
| Ice Border | 100 streak freezes purchased | M$50,000 |
| Stonks (Up) | M$100k+ profit in single market | M$25,000 |
| Stonks (Down) | M$100k+ loss in single market | M$25,000 |
| Leveraged | M$100k+ loans outstanding/taken | M$25,000 |
| Giver | $100+ donated to charity | M$25,000 |
| Hype Man | 100+ referrals | M$25,000 |
| Whale | M$10M+ total trade volume | M$100,000 |

### Implementation Steps

1. Add `requirement` field to `ShopItem` type:
```typescript
requirement?: {
  type: 'streak' | 'purchases' | 'profit' | 'loss' | 'loans' | 'donations' | 'referrals' | 'volume'
  threshold: number
  description: string  // e.g., "Reach a 100-day betting streak"
}
```

2. Query user stats on shop page load
3. Grey out locked items with requirement overlay
4. Backend validates requirement before purchase
5. Show progress towards unlocking

### Achievement Tracking

Most stats already exist:
- Streak: `users.currentBettingStreak`
- Purchases: Count from `shop_orders` where `item_id = 'streak-forgiveness'`
- Profit/Loss: `user_contract_metrics`
- Loans: `txns` where `category = 'LOAN'`
- Donations: `charity_giveaway_tickets` or direct donation tracking
- Referrals: `users` where `referredByUserId = X`
- Volume: Sum from `contract_bets`

---

## Audit Remediation

**Status:** 🔧 In Progress (February 2026)

Findings from a comprehensive dual-agent audit (Gemini 3 Pro + Claude Opus 4.6) of the `shop-items2` branch. Issues are severity-ranked.

### CRITICAL — Must fix before merge

| # | Issue | File(s) | Fix |
|---|-------|---------|-----|
| C1 | **Printful HTTP call inside `pg.tx()`** — holds DB connection during external API call (pool exhaustion risk) + orphaned Printful orders if post-HTTP DB insert fails | `shop-purchase-merch.ts` | Move `createPrintfulOrder()` outside the transaction. Draft orders (`confirm: false`) are safe to create first. |
| C2 | **Charity champion race condition** — two concurrent claims both succeed under `READ COMMITTED` | `claim-charity-champion.ts` | Add `SELECT ... FOR UPDATE` on the giveaway row to serialize claims |
| C3 | **Metadata injection** — `z.record(z.any())` allows arbitrary JSON storage, bypassing button text option lists | `shop-update-metadata.ts`, `schema.ts` | Validate metadata per `itemId` server-side; add size cap |
| C4 | **Error handler swallows own `APIError`** — catch block re-catches the structured error thrown in the try | `shop-purchase-merch.ts`, `shop-shipping-rates.ts` | `catch (e) { if (e instanceof APIError) throw e; ... }` |

### HIGH — Should fix before merge

| # | Issue | File(s) | Fix |
|---|-------|---------|-----|
| H1 | **`shop-toggle.ts` race condition** — concurrent toggles bypass `EXCLUSIVE_SLOTS` | `shop-toggle.ts` | `SELECT 1 FROM users WHERE id = $1 FOR UPDATE` at start of tx |
| H2 | **`PENDING_FULFILLMENT` not in `ShopOrder` type** — merch orders use unlisted status | `types.ts` | Add to status union type |
| H3 | **Admin reset misses merch orders** — only refunds `COMPLETED`, not `PENDING_FULFILLMENT` | `shop-reset-all.ts` | Include `PENDING_FULFILLMENT` in status filter |
| H4 | **Silent `.catch(() => {})`** — notification errors invisible | `claim-charity-champion.ts`, `buy-charity-giveaway-tickets.ts` | `.catch((e) => console.error(...))` |
| H5 | **`as any` cast for partial User** — fragile type bypass | `claim-charity-champion.ts` | Use `Pick<User, ...>` instead |

### MEDIUM — Fix when convenient

| # | Issue | File(s) | Fix |
|---|-------|---------|-----|
| M1 | **Missing `shop_orders` index** — full table scans | DB migration | `CREATE INDEX shop_orders_user_id_item_id ON shop_orders (user_id, item_id)` |
| M2 | **Fractional tickets** — `numTickets` not validated as integer | `schema.ts` | `z.number().int().positive()` |
| M3 | **Subscription expiry not idempotent** — duplicate notifications on re-run | `check-subscription-expiry.ts` | Deterministic notification ID: `mem_exp_${userId}_${expiresTime}` |
| M4 | **Heavy aggregate queries inside tx** — achievement checks hold locks | `shop-purchase.ts` | Move read-only requirement checks before the transaction |
| M5 | **Unused imports in shipping rates** — no variant validation | `shop-shipping-rates.ts` | Remove unused imports, optionally validate variant |

### Implementation Order

1. Fix C1-C4 (critical backend safety)
2. Fix H1-H5 (race conditions, type safety, observability)
3. Fix M1-M5 (performance, validation, cleanup)
4. Re-run audit to verify all issues resolved

---

## Future: Merch Background

**Status:** 📋 Planned — design complete, not yet implemented

A hidden hovercard background that auto-appears when a user buys any merch item. Shows "bad drawings" of merch items as a fun Easter egg.

### Key files to create/modify

| File | Change |
|------|--------|
| `common/src/shop/items.ts` | Add `hovercard-merch-bg` item definition (hidden, earned) |
| `backend/api/src/shop-purchase-merch.ts` | Auto-grant entitlement on successful merch purchase |
| `web/components/user/user-hovercard.tsx` | Render merch background when active |
| `web/pages/shop.tsx` | Optional preview card |

---

*Document maintained by: Engineering Team*
*Last updated: February 24, 2026*
