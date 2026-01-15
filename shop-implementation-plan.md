# Manifold Shop Implementation Plan - v3

**Created:** December 2024
**Last Updated:** January 12, 2025
**Status:** Schema Migration In Progress
**Branch:** `shop`

---

## Change Log

### January 8, 2025 - Schema Migration to Database Tables

**Breaking Change:** Migrating from `user.shopPurchases` JSON field to proper database tables.

**New Schema:**
- `user_entitlements` - Tracks active digital item ownership
- `shop_orders` - Tracks purchase history (future: Printful merch orders)

**Migration Tasks:**
- [x] Create `user_entitlements` table in Supabase (dev)
- [x] Create `shop_orders` table in Supabase (dev)
- [ ] Remove `shopPurchases` field from User type
- [ ] Update `shop-purchase` API to write to tables
- [ ] Update `shop-toggle` API to update `user_entitlements`
- [ ] Update frontend helpers to query entitlements
- [ ] Add `user-entitlements` API endpoint

### January 7, 2025 - Profile Glow & Shop UI Improvements

**Completed:**
- [x] Added Profile Glow hovercard item (75,000 M$, permanent)
- [x] Integrated glow effect into `web/components/user/user-hovercard.tsx`
- [x] Added full mock-hovercard preview to shop page
- [x] Changed shop header to "Cosmetics" with gem icon
- [x] Added "Buy mana" button for insufficient balance
- [x] Added "Spend mana" sidebar button with NEW badge
- [x] Added Graduation Cap avatar overlay item
- [x] Converted cosmetics to permanent-toggleable (Golden Border, Crown, Grad Cap, Glow)
- [x] Added Manifold Supporter (1 year) option

### January 7, 2025 - Phase 2: PAMPU Skin Integration

**Completed:**
- [x] Added `userHasPampuSkin()` helper
- [x] Integrated PAMPU skin into bet panels - YES buttons show "PAMPU"
- [x] Added Crown avatar overlay item
- [x] Added live previews for all items

---

## Database Schema (Created in Dev)

### Table 1: `user_entitlements`

Tracks active digital items a user owns. Simple, fast lookups.

```sql
CREATE TABLE user_entitlements (
  user_id TEXT NOT NULL,
  entitlement_id TEXT NOT NULL,       -- matches ShopItem.id (e.g., 'pampu-skin')
  granted_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_time TIMESTAMPTZ,           -- null = permanent
  enabled BOOLEAN NOT NULL DEFAULT TRUE,  -- for toggleable items
  PRIMARY KEY (user_id, entitlement_id)
);
```

**Usage:**
- Check if user has PAMPU skin: `SELECT 1 FROM user_entitlements WHERE user_id = $1 AND entitlement_id = 'pampu-skin' AND enabled = true`
- Check if supporter badge active: `SELECT 1 FROM user_entitlements WHERE user_id = $1 AND entitlement_id LIKE 'supporter-badge%' AND enabled = true AND (expires_time IS NULL OR expires_time > NOW())`
- Toggle item: `UPDATE user_entitlements SET enabled = $1 WHERE user_id = $2 AND entitlement_id = $3`

### Table 2: `shop_orders`

Records all purchases. Also designed for future Printful merch integration.

```sql
CREATE TABLE shop_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,              -- matches ShopItem.id
  price_mana BIGINT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  txn_id TEXT,                        -- reference to txns table
  printful_order_id TEXT,             -- from Printful API (future)
  printful_status TEXT,               -- synced from Printful (future)
  status TEXT NOT NULL DEFAULT 'CREATED',
  metadata JSONB,                     -- size, color, variant, etc.
  created_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  shipped_time TIMESTAMPTZ,
  delivered_time TIMESTAMPTZ
);
```

**Usage:**
- Record purchase: `INSERT INTO shop_orders (user_id, item_id, price_mana, txn_id, status) VALUES ($1, $2, $3, $4, 'COMPLETED')`
- Get user's order history: `SELECT * FROM shop_orders WHERE user_id = $1 ORDER BY created_time DESC`
- Admin stats: `SELECT item_id, COUNT(*), SUM(price_mana) FROM shop_orders GROUP BY item_id`

---

## TypeScript Types

### common/src/shop/types.ts

```typescript
// Entitlement record from database
export type UserEntitlement = {
  userId: string
  entitlementId: string  // matches ShopItem.id
  grantedTime: number    // timestamp
  expiresTime?: number   // null = permanent
  enabled: boolean
}

// Shop order record from database
export type ShopOrder = {
  id: string
  userId: string
  itemId: string
  priceMana: number
  quantity: number
  txnId?: string
  printfulOrderId?: string
  printfulStatus?: string
  status: 'CREATED' | 'COMPLETED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'FAILED'
  metadata?: Record<string, any>
  createdTime: number
  shippedTime?: number
  deliveredTime?: number
}

// Shop item config (hardcoded in items.ts)
export type ShopItemType = 'instant' | 'time-limited' | 'permanent-toggleable'

export type ShopItem = {
  id: string
  name: string
  description: string
  price: number
  type: ShopItemType
  duration?: number      // ms, for time-limited items
  limit: 'one-time' | 'unlimited'
  category: 'badge' | 'avatar-border' | 'avatar-overlay' | 'skin' | 'consumable' | 'hovercard'
}
```

---

## API Changes

### Updated Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `get-shop-items` | GET | No | List all shop items (hardcoded config) |
| `shop-purchase` | POST | Yes | Purchase an item → creates order + entitlement |
| `shop-toggle` | POST | Yes | Enable/disable entitlement |
| `get-user-entitlements` | GET | No | Get user's active entitlements (for cosmetics display) |
| `get-my-shop-orders` | GET | Yes | Get current user's order history |

### New: `get-user-entitlements`

```typescript
'get-user-entitlements': {
  method: 'GET',
  visibility: 'public',
  authed: false,
  props: z.object({
    userId: z.string(),
  }).strict(),
  returns: {} as UserEntitlement[]
}
```

### Updated: `shop-purchase`

```typescript
// Backend logic (simplified)
export const shopPurchase = async ({ itemId }, auth) => {
  const item = getShopItem(itemId)
  const user = await getUser(auth.uid)

  // Validate balance, limits, etc.

  return await pg.tx(async (tx) => {
    // 1. Deduct balance
    await tx.none('UPDATE users SET balance = balance - $1 WHERE id = $2', [item.price, auth.uid])

    // 2. Create txn record
    const txnId = await createShopTxn(tx, auth.uid, item)

    // 3. Create shop_order record
    await tx.none(`
      INSERT INTO shop_orders (user_id, item_id, price_mana, txn_id, status)
      VALUES ($1, $2, $3, $4, 'COMPLETED')
    `, [auth.uid, itemId, item.price, txnId])

    // 4. Create/update entitlement (for non-instant items)
    if (item.type !== 'instant') {
      const expiresTime = item.duration ? Date.now() + item.duration : null
      await tx.none(`
        INSERT INTO user_entitlements (user_id, entitlement_id, expires_time, enabled)
        VALUES ($1, $2, $3, true)
        ON CONFLICT (user_id, entitlement_id)
        DO UPDATE SET expires_time = COALESCE(
          CASE WHEN user_entitlements.expires_time IS NULL THEN NULL
               WHEN $3 IS NULL THEN NULL
               ELSE GREATEST(user_entitlements.expires_time, $3)
          END, $3
        )
      `, [auth.uid, itemId, expiresTime ? new Date(expiresTime) : null])
    }

    // 5. Item-specific effects
    if (itemId === 'streak-forgiveness') {
      await tx.none('UPDATE users SET streak_forgiveness = streak_forgiveness + 1 WHERE id = $1', [auth.uid])
    }

    return { success: true }
  })
}
```

### Updated: `shop-toggle`

```typescript
export const shopToggle = async ({ itemId, enabled }, auth) => {
  const result = await pg.one(`
    UPDATE user_entitlements
    SET enabled = $1
    WHERE user_id = $2 AND entitlement_id = $3
    RETURNING *
  `, [enabled, auth.uid, itemId])

  if (!result) throw new APIError(404, 'Entitlement not found')

  return { success: true }
}
```

---

## Frontend Changes

### Helper Functions Update

```typescript
// common/src/shop/items.ts

// OLD (JSON-based):
// export function userHasPampuSkin(shopPurchases?: UserShopPurchase[]) { ... }

// NEW (entitlement-based):
export function hasActiveEntitlement(
  entitlements: UserEntitlement[] | undefined,
  itemId: string
): boolean {
  if (!entitlements) return false
  const ent = entitlements.find(e => e.entitlementId === itemId)
  if (!ent) return false
  if (!ent.enabled) return false
  if (ent.expiresTime && ent.expiresTime < Date.now()) return false
  return true
}

export function userHasPampuSkin(entitlements?: UserEntitlement[]) {
  return hasActiveEntitlement(entitlements, 'pampu-skin')
}

export function userHasHovercardGlow(entitlements?: UserEntitlement[]) {
  return hasActiveEntitlement(entitlements, 'hovercard-glow')
}

export function userHasSupporterBadge(entitlements?: UserEntitlement[]) {
  return hasActiveEntitlement(entitlements, 'supporter-badge-30d') ||
         hasActiveEntitlement(entitlements, 'supporter-badge-1y')
}
```

### Fetching Entitlements

Option A: Include in user fetch (recommended for logged-in user's own entitlements)
```typescript
// Modify getUser to join entitlements
const user = await getUser(userId) // includes user.entitlements
```

Option B: Separate API call (for viewing other users)
```typescript
const { data: entitlements } = useAPIGetter('get-user-entitlements', { userId })
```

Option C: Batch fetch for lists (e.g., leaderboard)
```typescript
// Backend provides entitlements in list response
```

### Shop Page Updates

```typescript
// web/pages/shop.tsx

export default function ShopPage() {
  const user = useUser()
  const { data: myEntitlements } = useAPIGetter('get-user-entitlements',
    { userId: user?.id ?? '' },
    { enabled: !!user }
  )

  const hasItem = (itemId: string) => hasActiveEntitlement(myEntitlements, itemId)

  // ... rest of component
}
```

---

## Migration Checklist

### Step 1: Create Database Tables

1. Go to Supabase Dashboard → SQL Editor
2. Run the `user_entitlements` CREATE TABLE statement
3. Run the `shop_orders` CREATE TABLE statement
4. Verify tables exist in Table Editor

### Step 2: Update Backend

- [ ] Create `backend/api/src/get-user-entitlements.ts`
- [ ] Update `backend/api/src/shop-purchase.ts` to write to new tables
- [ ] Update `backend/api/src/shop-toggle.ts` to update `user_entitlements`
- [ ] Add routes to `backend/api/src/routes.ts`
- [ ] Update `common/src/api/schema.ts` with new endpoint

### Step 3: Update Common Types

- [ ] Create/update `common/src/shop/types.ts` with `UserEntitlement`, `ShopOrder`
- [ ] Update `common/src/shop/items.ts` helper functions
- [ ] Remove `shopPurchases` from `common/src/user.ts` (or deprecate)

### Step 4: Update Frontend

- [ ] Update `web/pages/shop.tsx` to fetch entitlements
- [ ] Update `web/components/bet/bet-panel.tsx` to use new helper
- [ ] Update `web/components/bet/feed-bet-button.tsx` to use new helper
- [ ] Update `web/components/user/user-hovercard.tsx` to use new helper

### Step 5: Testing

- [ ] Test purchasing a new item
- [ ] Test toggling an item on/off
- [ ] Test time-limited item expiration check
- [ ] Test one-time purchase limit enforcement
- [ ] Test streak forgiveness increment
- [ ] Test cosmetics display on other users

---

## Shop Items (Current)

| ID | Name | Price | Type | Duration | Category |
|----|------|-------|------|----------|----------|
| `supporter-badge-30d` | Manifold Supporter (1 month) | 100,000 M$ | time-limited | 30 days | badge |
| `supporter-badge-1y` | Manifold Supporter (1 year) | 1,000,000 M$ | time-limited | 365 days | badge |
| `avatar-golden-border` | Golden Border | 125,000 M$ | permanent-toggleable | forever | avatar-border |
| `avatar-crown` | Crown | 100,000,000 M$ | permanent-toggleable | forever | avatar-overlay |
| `avatar-graduation-cap` | Graduation Cap | 100,000 M$ | permanent-toggleable | forever | avatar-overlay |
| `streak-forgiveness` | Streak Freeze | 10,000 M$ | instant | - | consumable |
| `pampu-skin` | PAMPU Skin | 25,000 M$ | permanent-toggleable | forever | skin |
| `hovercard-glow` | Profile Glow | 75,000 M$ | permanent-toggleable | forever | hovercard |

---

## Future: Printful Merch Integration

When ready to add physical merchandise:

1. **Shop items config** - Add items with `category: 'merch'` and `printfulProductId`
2. **Purchase flow** - Collect shipping info in modal, send directly to Printful API
3. **Order tracking** - Use `shop_orders.printful_order_id` and `printful_status`
4. **Status sync** - Webhook or polling to update order status from Printful
5. **No shipping storage** - Shipping info sent to Printful, not stored in our DB

The `shop_orders` table is already designed to support this with:
- `printful_order_id` - ID from Printful API
- `printful_status` - 'pending', 'fulfilled', 'shipped', etc.
- `metadata` - Can store variant/size/color selections
- `shipped_time` / `delivered_time` - Tracking timestamps

---

## Charity Champion Trophy System

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
// GET /api/get-charity-giveaway
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

// POST /api/claim-charity-champion
props: { enabled?: boolean }  // Toggle trophy visibility
returns: { success: boolean, entitlements: UserEntitlement[] }
```

### Shop Item Type: 'earned'

```typescript
// In common/src/shop/items.ts
{
  id: 'charity-champion-trophy',
  name: 'Charity Champion Trophy',
  description: 'Exclusive trophy for the #1 ticket buyer in the charity raffle',
  price: 0,           // Cannot be purchased
  type: 'earned',     // Special type - excluded from shop grid
  limit: 'one-time',
  category: 'badge',
}
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

### Performance Optimizations

1. **Single API call** - `shop.tsx` fetches once, passes data to both cards
2. **Parallel DB queries** - `get-charity-giveaway.ts` uses `Promise.all()` for 4 queries
3. **Light caching** - `LIGHT_CACHE_STRATEGY` reduces redundant API calls
4. **Loading skeletons** - Cards show skeleton UI while data loads

### How to Remove This Feature

To completely remove the Charity Champion Trophy:

1. **Frontend cleanup:**
   ```bash
   # Delete component
   rm web/components/shop/charity-champion-card.tsx

   # Remove from shop.tsx:
   # - Delete CharityChampionCard import
   # - Delete CharityChampionCard usage in JSX
   # - Optionally remove charityGiveawayData if only used by champion card

   # Remove badge from user-link.tsx:
   # - Delete CharityChampionBadge component
   # - Remove userHasCharityChampionTrophy import and usage
   ```

2. **Backend cleanup:**
   ```bash
   # Delete claim API
   rm backend/api/src/claim-charity-champion.ts

   # Remove from routes.ts:
   # - Delete import { claimCharityChampion }
   # - Delete 'claim-charity-champion': claimCharityChampion

   # In get-charity-giveaway.ts:
   # - Remove champion and trophyHolder queries from Promise.all
   # - Remove champion and trophyHolder from return object
   ```

3. **Common cleanup:**
   ```bash
   # In common/src/api/schema.ts:
   # - Remove champion and trophyHolder from get-charity-giveaway returns
   # - Delete claim-charity-champion schema entry

   # In common/src/shop/items.ts:
   # - Delete charity-champion-trophy from SHOP_ITEMS
   # - Delete userHasCharityChampionTrophy helper
   # - Delete CHARITY_CHAMPION_ENTITLEMENT_ID export
   ```

4. **Database cleanup (optional):**
   ```sql
   -- Remove trophy entitlements
   DELETE FROM user_entitlements WHERE entitlement_id = 'charity-champion-trophy';
   ```

### How to Modify/Improve

**Change trophy criteria (e.g., most tickets in last 7 days):**
- Edit the champion query in `get-charity-giveaway.ts`

**Add multiple trophy tiers (gold/silver/bronze):**
- Add new entitlement IDs to `items.ts`
- Modify `get-charity-giveaway.ts` to return top 3 users
- Update `charity-champion-card.tsx` to show all three
- Update `claim-charity-champion.ts` to handle position parameter

**Auto-claim trophy (no manual claim needed):**
- Remove `claim-charity-champion.ts` API
- Add a scheduled function that updates `user_entitlements` when champion changes
- Remove claim button from `charity-champion-card.tsx`

**Show trophy on charity page instead of shop:**
- Move `CharityChampionCard` to `/charity` page
- Pass giveaway data via props or fetch there

---

## Future: Achievement-Gated Items

Items that require specific achievements to unlock before purchasing.

| Item | Requirement | Price |
|------|-------------|-------|
| Flame Border | 100-day betting streak | 50,000 M$ |
| Ice Border | 100 streak freezes purchased | 50,000 M$ |
| Stonks (Up) | 100k+ profit in single market | 25,000 M$ |
| Stonks (Down) | 100k+ loss in single market | 25,000 M$ |
| Leveraged | 100k+ loans outstanding/taken | 25,000 M$ |
| Giver | $100+ donated to charity | 25,000 M$ |
| Hype Man | 100+ referrals | 25,000 M$ |
| Whale | 10M+ total trade volume | 100,000 M$ |

**Implementation:**
- Add `requirement` field to `ShopItem` type
- Query user stats on shop page load
- Grey out locked items with requirement overlay
- Backend validates requirement before purchase

---

## Key Files Reference

| Purpose | File |
|---------|------|
| Shop item config | `common/src/shop/items.ts` |
| Shop types | `common/src/shop/types.ts` |
| User type | `common/src/user.ts` |
| API schema | `common/src/api/schema.ts` |
| Purchase API | `backend/api/src/shop-purchase.ts` |
| Toggle API | `backend/api/src/shop-toggle.ts` |
| Shop page | `web/pages/shop.tsx` |
| Bet panel (PAMPU) | `web/components/bet/bet-panel.tsx` |
| Hovercard (Glow) | `web/components/user/user-hovercard.tsx` |

---

*Document maintained by: Engineering Team*
*Last updated: January 2025*
