# Manifold Shop Implementation Plan - v2

**Created:** December 2024
**Last Updated:** January 7, 2025
**Status:** Phase 2 In Progress
**Branch:** `bans-and-moderation`

---

## Change Log

### January 7, 2025 - Profile Glow & Shop UI Improvements

**Completed:**
- [x] Added Profile Glow hovercard item (75,000 M$, 30 days)
- [x] Integrated glow effect into `web/components/user/user-hovercard.tsx`
- [x] Added full mock-hovercard preview to shop page
- [x] Changed shop header to "Cosmetics" with gem icon (distinct from /checkout)
- [x] Added "Buy mana" button for insufficient balance
- [x] Added "Spend mana" sidebar button with NEW badge
- [x] Added Graduation Cap avatar overlay item

**Files Modified:**
| File | Change |
|------|--------|
| `common/src/shop/items.ts` | Added `hovercard-glow` item, `userHasHovercardGlow()` helper |
| `web/components/user/user-hovercard.tsx` | Glow effect integration |
| `web/pages/shop.tsx` | New header, HovercardGlowPreview, Buy mana button |
| `web/components/nav/sidebar.tsx` | Added "Spend mana" button with NEW badge |

### January 7, 2025 - Phase 2: PAMPU Skin Integration

**Completed:**
- [x] Added `userHasPampuSkin()` helper to `common/src/shop/items.ts`
- [x] Integrated PAMPU skin into `web/components/bet/bet-panel.tsx` - YES buttons show "PAMPU" when user owns skin
- [x] Integrated PAMPU skin into `web/components/bet/feed-bet-button.tsx` - feed card buttons show "Bet Pampu"
- [x] Added Crown avatar overlay item (150,000 M$, 30 days)
- [x] Added Crown preview component to shop page
- [x] Improved shop page styling to match `/checkout` page
- [x] Added live previews for all items using actual user data

**Files Modified:**
| File | Change |
|------|--------|
| `common/src/shop/items.ts` | Added `userHasPampuSkin()` helper, added Crown item |
| `web/components/bet/bet-panel.tsx` | PAMPU skin integration for YES buttons |
| `web/components/bet/feed-bet-button.tsx` | PAMPU skin integration for feed cards |
| `web/pages/shop.tsx` | Improved styling, added Crown preview, refined Streak Freeze preview |

### January 7, 2025 - Phase 1 Complete

**Completed:**
- [x] Added `SHOP_PURCHASE` transaction type to `common/src/txn.ts`
- [x] Added `shopPurchases?: UserShopPurchase[]` field to User type in `common/src/user.ts`
- [x] Created `common/src/shop/items.ts` with shop items and helper functions
- [x] Added API schema for `get-shop-items`, `shop-purchase`, `shop-toggle` in `common/src/api/schema.ts`
- [x] Created `backend/api/src/get-shop-items.ts` - returns hardcoded items
- [x] Created `backend/api/src/shop-purchase.ts` - handles purchases with balance deduction, txn creation
- [x] Created `backend/api/src/shop-toggle.ts` - toggles enabled/disabled state
- [x] Added routes to `backend/api/src/routes.ts`
- [x] Created `web/pages/shop.tsx` - full shop page with purchase modal and owned items section

**Files Created/Modified:**
| File | Change |
|------|--------|
| `common/src/txn.ts` | Added `ShopPurchase` type and `SHOP_PURCHASE` category |
| `common/src/user.ts` | Added `shopPurchases` field and `UserShopPurchase` type |
| `common/src/shop/items.ts` | New file - item config and helpers |
| `common/src/api/schema.ts` | Added 3 new API endpoints |
| `backend/api/src/get-shop-items.ts` | New file |
| `backend/api/src/shop-purchase.ts` | New file |
| `backend/api/src/shop-toggle.ts` | New file |
| `backend/api/src/routes.ts` | Added route handlers |
| `web/pages/shop.tsx` | New file - shop page |

---

## Current State

### What's Working
- Shop page accessible at `/shop` with polished "Cosmetics" UI
- 8 items displayed with live previews using actual user data
- User balance shown with "Add more →" link to checkout
- "Buy mana" button shown when user can't afford an item
- Purchase flow with confirmation modal
- API endpoints for purchasing and toggling items
- Transaction recording for audit trail
- Owned items section with toggle buttons
- **PAMPU Skin:** YES buttons across the site show "PAMPU" when user owns and enables the skin
- **Profile Glow:** User hovercards show violet glow effect
- **Sidebar:** "Spend mana" button with NEW badge (desktop only)

### What's Not Yet Implemented
- Visual effects for avatar items (golden border, crown, graduation cap) - need integration into Avatar component
- Supporter badge display next to usernames
- Achievement-gated items (Phase 4)
- End-to-end testing of purchase flow

---

## Upcoming Work

### Phase 3: Integration & Visual Effects (Continued)

**Supporter Badge:**
- [ ] Add badge next to username in `web/components/widgets/user-link.tsx`
- [ ] Check for active `supporter-badge-*` purchase
- [ ] Handle expiration display

**Avatar Decorations:**
- [ ] Integrate golden border into `web/components/widgets/avatar.tsx`
- [ ] Integrate crown overlay into Avatar component
- [ ] Integrate graduation cap overlay
- [ ] Check for active purchases and apply styles

**Testing:**
- [ ] Test full purchase flow end-to-end
- [ ] Test streak forgiveness increment
- [ ] Test PAMPU skin toggle on/off
- [ ] Test time-limited item expiration

### Phase 4: Achievement-Gated Items

Items that require specific achievements to unlock before purchasing. Display greyed out with "You need X to unlock this item" overlay.

**Hovercard Effects (Achievement-Gated):**

| Item | Requirement | Price | Effect |
|------|-------------|-------|--------|
| 🔥 Flame Border | 100-day betting streak | 50,000 M$ | Animated flame effect on hovercard |
| ❄️ Ice Border | 100 streak freezes purchased | 50,000 M$ | Frost/ice effect on hovercard |

**Profile Badges (Achievement-Gated):**

| Item | Requirement | Price | Effect |
|------|-------------|-------|--------|
| 📈 Stonks (Up) | 100k+ profit in single market | 25,000 M$ | Green up arrow icon on profile |
| 📉 Stonks (Down) | 100k+ loss in single market | 25,000 M$ | Red down arrow icon on profile |
| 🏦 Leveraged | 100k+ loans outstanding/taken | 25,000 M$ | Bank/leverage icon on profile |
| 💝 Giver | $100+ donated to charity | 25,000 M$ | Heart/charity icon on profile |
| 📣 Hype Man | 100+ referrals | 25,000 M$ | Megaphone icon on profile |
| 🐋 Whale | 10M+ total trade volume | 100,000 M$ | Whale icon on profile |

**Implementation Notes:**
- Add `requirement` field to `ShopItem` type with achievement criteria
- Query user stats on shop page load (similar to achievements page)
- Grey out locked items with overlay showing requirement
- Backend validates requirement is met before allowing purchase
- Stats queries can reuse existing achievements infrastructure

**Data Sources (same as achievements):**
- Betting streak: `user.currentBettingStreak`
- Streak freezes: Count of `streak-forgiveness` purchases in txns
- Market profit/loss: Query `contract_bets` aggregated by contract
- Loans: `user.totalDeposits` or loan-related metrics
- Charity donations: Query charity txns
- Referrals: Count users with `referredByUserId = user.id`
- Trade volume: Sum of bet amounts from `contract_bets`

### Phase 5: Polish

- [ ] Add success animation/confetti on purchase
- [ ] Add "time remaining" display for time-limited items
- [ ] Consider adding shop link to user profile
- [ ] Remove "NEW" badge from sidebar after launch period

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

## Technical Notes

### Data Flow
1. User clicks "Buy" → confirmation modal
2. `POST /shop-purchase` with `{ itemId }`
3. Backend validates balance, creates txn, updates `user.shopPurchases`
4. For streak-forgiveness: also increments `user.streakForgiveness`
5. Frontend receives success, user object refreshes via websocket

### PAMPU Skin Integration
The PAMPU skin modifies YES buttons in:
- `bet-panel.tsx`: Main betting panel and outcome toggle
- `feed-bet-button.tsx`: Feed card bet buttons

Uses `userHasPampuSkin(user?.shopPurchases)` helper to check ownership.

### Stats Queries
```sql
-- Total mana spent in shop
SELECT SUM(amount) FROM txns WHERE category = 'SHOP_PURCHASE'

-- Purchases by item
SELECT data->>'itemId' as item, COUNT(*), SUM(amount)
FROM txns WHERE category = 'SHOP_PURCHASE'
GROUP BY data->>'itemId'
```

### Future Migration Path
If we need a dedicated table later:
1. Create `shop_purchases` table
2. Migrate data from `user.shopPurchases` JSON
3. Update API endpoints
4. Deprecate JSON field

---

---

# Archive

*Original planning document below, kept for reference.*

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Decisions](#architecture-decisions)
3. [Data Storage Strategy](#data-storage-strategy)
4. [Digital Goods System](#digital-goods-system)
5. [Balance Validation & Purchase Flow](#balance-validation--purchase-flow)
6. [API Endpoints](#api-endpoints)
7. [Frontend Structure](#frontend-structure)
8. [Implementation Phases](#implementation-phases)

---

## Executive Summary

Build a `/shop` page where users can spend mana on digital goods. This MVP focuses on simplicity:

- **No new database tables** - All ownership data stored in JSON fields on the User type
- **No comment awards** - Deferred for simplicity
- **No physical goods** - Deferred (Printful integration can come later)
- **4 digital items** to start

### Initial Digital Items

| Item | Type | Behavior |
|------|------|----------|
| Manifold Supporter Badge | Time-limited, toggleable | Badge next to name, expires after duration |
| Avatar Decorations | Toggleable | Border colors, username colors, overlays |
| Streak Forgiveness | Instant consumable | +1 to `user.streakForgiveness` |
| PAMPU Skin | Toggleable, permanent | Changes YES button appearance |

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| URL | `/shop` | No conflict with `/checkout` (mana purchase) |
| Data Storage | JSON on User type | No schema changes needed, simpler to ship |
| Transaction Type | `SHOP_PURCHASE` | New txn category for audit trail |
| Item Catalog | Hardcoded in TypeScript | Items need code anyway for behavior |
| Kill Switch | Existing system or simple flag | Can use existing patterns |

---

## Data Storage Strategy

### Principle: No New Tables

Instead of creating `shop_purchases` or `shop_items` tables, we store ownership data directly on the User type in JSON fields. This mirrors how `streakForgiveness` already works.

### Proposed User Type Additions

```typescript
// In common/src/user.ts
export type User = {
  // ... existing fields ...

  streakForgiveness: number  // ALREADY EXISTS - streak freeze points

  // NEW: Shop-related fields
  shopPurchases?: ShopPurchase[]  // History of all purchases
}

type ShopPurchase = {
  itemId: string
  purchasedAt: number  // timestamp
  expiresAt?: number   // for time-limited items
  enabled?: boolean    // for toggleable items (default true)
  txnId: string        // reference to transaction
}
```

### Why This Works

1. **Streak Forgiveness**: Already a number on User - just increment it
2. **Time-limited items**: Store `expiresAt`, check on render
3. **Toggleable items**: Store `enabled` flag, user can flip it in shop
4. **Purchase history**: Array of purchases with txn references
5. **Querying owned items**: Filter `shopPurchases` where item is active/not expired

### Trade-offs

| Pros | Cons |
|------|------|
| No migrations needed | Can't query across all users efficiently |
| Ships faster | No admin dashboard for purchase stats |
| Simple to understand | User object grows slightly |
| Atomic with user updates | Limited to ~1MB per user (plenty) |

### Stats & Record Keeping

We can still query aggregate stats via the `txns` table since every purchase creates a transaction with `category: 'SHOP_PURCHASE'`:

```sql
-- Total mana spent in shop
SELECT SUM(amount) FROM txns WHERE category = 'SHOP_PURCHASE'

-- Mana spent per item
SELECT data->>'itemId' as item, SUM(amount)
FROM txns WHERE category = 'SHOP_PURCHASE'
GROUP BY data->>'itemId'
```

The txn table provides the audit trail. What we can't easily query is "list all users with active X item" - but that's a less common need.

### Future Migration to DB Table

If we later need more sophisticated queries (e.g., admin dashboard showing all active badge holders), migrating to a dedicated table is straightforward:

1. Create `shop_purchases` table with same structure as `ShopPurchase` type
2. Migration script reads `user.shopPurchases` JSON and inserts rows
3. Update API endpoints to read/write from table instead of JSON
4. Remove or deprecate the JSON field

The `shopPurchases` array structure mirrors a table schema, making migration a simple transformation.

---

## Digital Goods System

### Item 1: Manifold Supporter Badge

**Type**: Time-limited, toggleable
**Behavior**: Shows a badge/icon next to username for X days

**Implementation**:
```typescript
// Purchase creates entry in shopPurchases with expiresAt
{
  itemId: 'supporter-badge-30d',
  purchasedAt: Date.now(),
  expiresAt: Date.now() + 30 * DAY_MS,
  enabled: true,
  txnId: 'txn_xxx'
}

// Display logic checks:
// 1. Has purchase with itemId starting with 'supporter-badge'
// 2. expiresAt > now
// 3. enabled === true
```

**Display**: Badge component checks user's shopPurchases, renders badge if active.

**Toggle**: User can disable in shop (sets `enabled: false`) to hide badge.

---

### Item 2: Avatar Decorations

**Type**: Toggleable, time-limited or permanent (configurable per decoration)

**Sub-items** (examples):
- Hover border color (e.g., golden glow)
- Username display color
- Avatar image overlay (e.g., crown, frame)

**Implementation Considerations**:

This is the most complex item type. Options:

#### Option A: Single "decoration" field with config
```typescript
type ShopPurchase = {
  itemId: 'avatar-golden-border' | 'avatar-crown-overlay' | 'username-color-gold'
  // ... other fields
}

// Rendering checks for specific itemIds and applies styles
```

#### Option B: Structured decoration object on User
```typescript
// On User type
avatarDecoration?: {
  borderColor?: string      // e.g., '#FFD700' or 'golden'
  borderStyle?: string      // e.g., 'glow', 'solid', 'animated'
  overlay?: string          // e.g., 'crown', 'sparkles'
  usernameColor?: string    // e.g., '#FFD700'
}
```

**Recommendation**: Option A (store as shopPurchases) because:
- Consistent with other items
- Supports expiration naturally
- Can have multiple decorations purchased
- Rendering logic derives active decoration from purchases

**Rendering Flow**:
1. Get user's shopPurchases
2. Filter to avatar decoration items that are active (not expired, enabled)
3. Derive decoration config from active items
4. Apply to Avatar/Username components

**Questions to Consider**:
- Can users stack multiple decorations? (e.g., border + overlay)
- If stacking allowed, what's the precedence?
- Should decorations be mutually exclusive within category?

**Suggested Approach**: Allow one active item per category:
- One border decoration active at a time
- One overlay active at a time
- One username color active at a time

User picks which to enable if they own multiple.

---

### Item 3: Streak Forgiveness

**Type**: Instant consumable
**Behavior**: Adds +1 to `user.streakForgiveness`

**Implementation**:
```typescript
// On purchase:
await updateUser(userId, {
  streakForgiveness: FieldValue.increment(1)
})

// Also record in shopPurchases for history
shopPurchases.push({
  itemId: 'streak-forgiveness',
  purchasedAt: Date.now(),
  txnId: 'txn_xxx'
  // No expiresAt, no enabled - it's consumed immediately
})
```

**Note**: The `streakForgiveness` field already exists on User. Points accumulate (new daily points + purchased points).

---

### Item 4: PAMPU Skin

**Type**: Toggleable, permanent (one-time purchase)
**Behavior**: Changes YES button appearance

**Implementation**:
```typescript
// Purchase creates entry:
{
  itemId: 'pampu-skin',
  purchasedAt: Date.now(),
  enabled: true,
  txnId: 'txn_xxx'
  // No expiresAt - permanent
}

// User can toggle enabled on/off in shop
// YES button component checks for active pampu-skin purchase
```

**Limit**: One-time purchase. Check if user already owns before allowing purchase.

---

### Item Configuration (Hardcoded)

```typescript
// common/src/shop/items.ts

export type ShopItemType = 'instant' | 'time-limited' | 'toggleable' | 'permanent-toggleable'

export type ShopItem = {
  id: string
  name: string
  description: string
  price: number  // in mana
  type: ShopItemType
  duration?: number  // ms, for time-limited items
  limit?: 'one-time' | 'unlimited'  // per-user purchase limit
  category?: 'badge' | 'avatar-border' | 'avatar-overlay' | 'username-color' | 'skin' | 'consumable'
  imageUrl?: string
}

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: 'supporter-badge-30d',
    name: 'Manifold Supporter Badge',
    description: 'Show your support with a badge next to your name for 30 days',
    price: 100000,  // 100k mana
    type: 'time-limited',
    duration: 30 * 24 * 60 * 60 * 1000,  // 30 days
    limit: 'unlimited',  // can re-purchase when expired
    category: 'badge',
  },
  {
    id: 'avatar-golden-border',
    name: 'Golden Border',
    description: 'A prestigious golden glow around your avatar',
    price: 125000,
    type: 'time-limited',
    duration: 30 * 24 * 60 * 60 * 1000,
    limit: 'unlimited',
    category: 'avatar-border',
  },
  {
    id: 'streak-forgiveness',
    name: 'Streak Freeze',
    description: 'Protect your betting streak - adds one forgiveness point',
    price: 10000,
    type: 'instant',
    limit: 'unlimited',
    category: 'consumable',
  },
  {
    id: 'pampu-skin',
    name: 'PAMPU Skin',
    description: 'Transform your YES button with the legendary PAMPU style',
    price: 25000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'skin',
  },
]

export const getShopItem = (id: string) => SHOP_ITEMS.find(item => item.id === id)
```

---

## Balance Validation & Purchase Flow

### Purchase Flow

```
1. User clicks "Buy" on item
2. Frontend shows confirmation modal with price
3. User confirms → POST /shop-purchase
4. Backend:
   a. Validate user exists, not banned
   b. Validate item exists, is active
   c. Check purchase limits (one-time items)
   d. Check balance >= price
   e. In transaction:
      - Deduct balance
      - Create txn record
      - Update user.shopPurchases array
      - Execute item-specific effect (e.g., increment streakForgiveness)
5. Return success → Frontend updates UI
```

### API Handler Pseudocode

```typescript
export const purchaseShopItem = async (props: { itemId: string }, auth: AuthedUser) => {
  const { itemId } = props
  const item = getShopItem(itemId)

  if (!item) throw new APIError(404, 'Item not found')

  const user = await getUser(auth.uid)

  // Check if user can transact
  const { canSend, message } = await canSendMana(user)
  if (!canSend) throw new APIError(403, message)

  // Check one-time purchase limit
  if (item.limit === 'one-time') {
    const alreadyOwns = user.shopPurchases?.some(p => p.itemId === itemId)
    if (alreadyOwns) throw new APIError(403, 'You already own this item')
  }

  // Check balance
  if (user.balance < item.price) {
    throw new APIError(403, 'Insufficient balance')
  }

  // Execute purchase in transaction
  return await pg.tx(async (tx) => {
    // Deduct balance
    await tx.none(
      'UPDATE users SET balance = balance - $1 WHERE id = $2',
      [item.price, auth.uid]
    )

    // Create txn record
    const txnId = await createTxn(tx, {
      category: 'SHOP_PURCHASE',
      fromId: auth.uid,
      fromType: 'USER',
      toId: 'BANK',  // or manifold house account
      toType: 'BANK',
      amount: item.price,
      token: 'M$',
      data: { itemId }
    })

    // Create purchase record
    const purchase: ShopPurchase = {
      itemId,
      purchasedAt: Date.now(),
      txnId,
      ...(item.duration && { expiresAt: Date.now() + item.duration }),
      ...(item.type.includes('toggleable') && { enabled: true }),
    }

    // Update user's shopPurchases
    await tx.none(
      `UPDATE users SET data = jsonb_set(
        COALESCE(data, '{}'),
        '{shopPurchases}',
        COALESCE(data->'shopPurchases', '[]') || $1::jsonb
      ) WHERE id = $2`,
      [JSON.stringify(purchase), auth.uid]
    )

    // Item-specific effects
    if (itemId === 'streak-forgiveness') {
      await tx.none(
        'UPDATE users SET streak_forgiveness = streak_forgiveness + 1 WHERE id = $1',
        [auth.uid]
      )
    }

    return { success: true, purchase }
  })
}
```

---

## API Endpoints

### New Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `shop-items` | GET | No | List all shop items (from hardcoded config) |
| `shop-purchase` | POST | Yes | Purchase an item |
| `shop-toggle` | POST | Yes | Enable/disable a toggleable item |
| `shop-purchases` | GET | Yes | Get user's purchase history |

### Schema Definitions

```typescript
// common/src/api/schema.ts

'shop-items': {
  method: 'GET',
  visibility: 'public',
  authed: false,
  props: z.object({}).strict(),
  returns: {} as ShopItem[]
},

'shop-purchase': {
  method: 'POST',
  visibility: 'public',
  authed: true,
  props: z.object({
    itemId: z.string(),
  }).strict(),
  returns: {} as { success: boolean; purchase?: ShopPurchase }
},

'shop-toggle': {
  method: 'POST',
  visibility: 'public',
  authed: true,
  props: z.object({
    itemId: z.string(),
    enabled: z.boolean(),
  }).strict(),
  returns: {} as { success: boolean }
},

'shop-purchases': {
  method: 'GET',
  visibility: 'public',
  authed: true,
  props: z.object({}).strict(),
  returns: {} as ShopPurchase[]
},
```

---

## Frontend Structure

### New Files

```
web/pages/
  shop.tsx              # Main shop page

web/components/shop/
  shop-item-card.tsx    # Individual item display
  purchase-button.tsx   # Buy button with confirmation
  owned-items.tsx       # User's purchased items with toggles
```

### Shop Page Layout

```tsx
export default function ShopPage() {
  const user = useUser()
  const { data: items } = useAPIGetter('shop-items', {})

  const ownedItems = user?.shopPurchases?.filter(p =>
    !p.expiresAt || p.expiresAt > Date.now()
  ) ?? []

  return (
    <Page>
      <Title text="Shop" />

      {/* User's active items */}
      {ownedItems.length > 0 && (
        <Section title="Your Items">
          <OwnedItems purchases={ownedItems} />
        </Section>
      )}

      {/* Available items */}
      <Section title="Available Items">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items?.map(item => (
            <ShopItemCard
              key={item.id}
              item={item}
              owned={ownedItems.some(p => p.itemId === item.id)}
            />
          ))}
        </div>
      </Section>
    </Page>
  )
}
```

### Integration Points

**Avatar Component**: Check for active avatar decorations
```tsx
// web/components/widgets/avatar.tsx
const activeDecoration = user.shopPurchases?.find(p =>
  p.category === 'avatar-border' &&
  p.enabled &&
  (!p.expiresAt || p.expiresAt > Date.now())
)
// Apply decoration styles
```

**Username Display**: Check for username color
```tsx
const usernameColor = user.shopPurchases?.find(p =>
  p.itemId.startsWith('username-color') &&
  p.enabled &&
  (!p.expiresAt || p.expiresAt > Date.now())
)
// Apply color style
```

**YES Button**: Check for PAMPU skin
```tsx
const hasPampu = user.shopPurchases?.some(p =>
  p.itemId === 'pampu-skin' && p.enabled
)
// Render PAMPU style if true
```

**Badge Display**: Check for supporter badge
```tsx
const hasBadge = user.shopPurchases?.some(p =>
  p.itemId.startsWith('supporter-badge') &&
  p.enabled &&
  (!p.expiresAt || p.expiresAt > Date.now())
)
// Show badge icon next to name
```

---

## Implementation Phases

### Phase 1: Foundation
- [x] Add `SHOP_PURCHASE` transaction type to txn.ts
- [x] Add `shopPurchases` field to User type
- [x] Create `common/src/shop/items.ts` with item config
- [x] Create shop page skeleton at `/shop`
- [x] Implement `shop-items` GET endpoint

### Phase 2: Purchase Flow
- [x] Implement `shop-purchase` POST endpoint
- [x] Add purchase button with confirmation modal
- [x] Implement streak forgiveness purchase (simplest item)
- [ ] Test purchase flow end-to-end

### Phase 3: Toggleable Items
- [x] Implement `shop-toggle` POST endpoint
- [x] Add toggle UI in owned items section
- [ ] Implement PAMPU skin purchase + toggle
- [ ] Integrate PAMPU skin into YES button component

### Phase 4: Time-Limited Items
- [ ] Implement supporter badge purchase
- [ ] Add badge display next to username
- [ ] Add expiration checking logic
- [ ] Show expiration countdown in owned items

### Phase 5: Avatar Decorations
- [ ] Design decoration system (borders, overlays, colors)
- [ ] Implement avatar decoration purchases
- [ ] Integrate decorations into Avatar component
- [ ] Add decoration preview in shop

---

## Open Questions

### 1. Avatar Decoration Stacking
Can users have multiple decorations active simultaneously (e.g., border + overlay)?

**Recommendation**: Yes, allow one per category (border, overlay, username color).

### 2. Expiration Notifications
Should users be notified when items are about to expire?

**Recommendation**: Defer. Can add later via existing notification system.

### 3. Refunds
Should expired items be refundable? What about toggleable items?

**Recommendation**: No refunds for MVP. Items are final sale.

### 4. Pricing
Are these prices appropriate?
- Supporter Badge (30d): 100,000 M$
- Golden Border (30d): 125,000 M$
- Streak Freeze: 10,000 M$
- PAMPU Skin: 25,000 M$

**Decision needed**: Review and confirm pricing.

---

## Appendix: Key File References

| Purpose | File |
|---------|------|
| User type | `common/src/user.ts` |
| Transaction types | `common/src/txn.ts` |
| Balance validation | `common/src/can-send-mana.ts` |
| API schema | `common/src/api/schema.ts` |
| Economy constants | `common/src/economy.ts` |

---

*Document maintained by: Engineering Team*
*Last updated: January 2025*
