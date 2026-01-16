# Manifold Mana Shop System

> **IMPORTANT**: Anyone who modifies the shop system MUST update this document to reflect the changes. This ensures any developer or AI agent can understand what's currently live and how to modify it.

## Quick Reference - Current Shop Items

| Item | Price | Type | File |
|------|-------|------|------|
| Manifold Plus | M$500/mo | time-limited (30 days) | `common/src/shop/items.ts` |
| Manifold Pro | M$2,500/mo | time-limited (30 days) | `common/src/shop/items.ts` |
| Manifold Premium | M$10,000/mo | time-limited (30 days) | `common/src/shop/items.ts` |
| Golden Glow | M$25,000 | permanent-toggleable | `common/src/shop/items.ts` |
| Crown | M$1,000,000 | permanent-toggleable | `common/src/shop/items.ts` |
| Graduation Cap | M$10,000 | permanent-toggleable | `common/src/shop/items.ts` |
| Streak Freeze | M$500 | instant | `common/src/shop/items.ts` |
| PAMPU Skin | M$1,000 | permanent-toggleable | `common/src/shop/items.ts` |
| Profile Border | M$10,000 | permanent-toggleable | `common/src/shop/items.ts` |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    SHOP SYSTEM FLOW                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  common/src/shop/items.ts    ←── Item definitions & prices  │
│           │                                                  │
│           ▼                                                  │
│  backend/api/src/shop-purchase.ts  ←── Purchase API         │
│           │                                                  │
│           ▼                                                  │
│  Database: user_entitlements  ←── Ownership tracking        │
│  Database: shop_orders        ←── Order history             │
│           │                                                  │
│           ▼                                                  │
│  web/pages/shop.tsx           ←── Shop UI                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### user_entitlements (digital items)
```sql
CREATE TABLE user_entitlements (
  user_id TEXT NOT NULL,
  entitlement_id TEXT NOT NULL,  -- matches item.id from SHOP_ITEMS
  granted_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_time TIMESTAMPTZ,       -- null = permanent
  enabled BOOLEAN NOT NULL DEFAULT TRUE,  -- for toggleable items
  PRIMARY KEY (user_id, entitlement_id)
);
```

### shop_orders (for Printful merch, future)
```sql
CREATE TABLE shop_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  price_mana BIGINT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  txn_id TEXT,                    -- reference to txns table
  printful_order_id TEXT,         -- from Printful API
  printful_status TEXT,           -- synced from Printful
  status TEXT NOT NULL DEFAULT 'CREATED',
  metadata JSONB,                 -- size, color, variant, etc.
  created_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  shipped_time TIMESTAMPTZ,
  delivered_time TIMESTAMPTZ
);
```

---

## Item Configuration

**File**: `common/src/shop/items.ts`

### Item Types
```typescript
export type ShopItemType =
  | 'instant'              // Execute immediately (e.g., streak forgiveness)
  | 'time-limited'         // Has expiration (e.g., supporter badge)
  | 'permanent-toggleable' // Owned forever, can enable/disable (e.g., PAMPU skin)
  | 'earned'               // Cannot be purchased, must be earned (for future use)
```

### Item Categories
```typescript
export type ShopItemCategory =
  | 'badge'           // Supporter badge
  | 'avatar-border'   // Golden border
  | 'avatar-overlay'  // Crown, graduation cap
  | 'skin'            // PAMPU skin
  | 'consumable'      // Streak freeze
  | 'hovercard'       // Profile glow
```

### Exclusive Categories (IMPORTANT)

**Some categories are "exclusive" - only one item can be enabled at a time.**

```typescript
export const EXCLUSIVE_CATEGORIES: ShopItemCategory[] = [
  'avatar-border',
  'avatar-overlay',
  'hovercard',
  'skin',
]
```

**Rules:**
- When a user **purchases** an item in an exclusive category, all other items in that category are automatically **disabled**
- When a user **enables** an item in an exclusive category via toggle, all other items in that category are automatically **disabled**
- This is enforced both on the **backend** (database transaction) and **frontend** (optimistic UI)

**When adding new items:**
1. Assign the correct category in the item definition
2. If items can coexist (e.g., supporter badges), use a non-exclusive category
3. If only one should be active (e.g., avatar overlays), use an exclusive category
4. Helper: `getEntitlementIdsForCategory(category)` returns all entitlement IDs in a category

### Item Definition Structure
```typescript
export type ShopItem = {
  id: string              // Unique identifier
  name: string            // Display name
  description: string     // Display description
  price: number           // Price in mana (M$)
  type: ShopItemType
  duration?: number       // ms, for time-limited items
  limit: 'one-time' | 'unlimited'  // Can user re-purchase?
  category: ShopItemCategory
  imageUrl?: string       // Optional preview image
  entitlementId?: string  // Optional: share entitlement across items
  alwaysEnabled?: boolean // If true, no toggle switch (e.g., supporter badge)
}
```

### Current Items Configuration
```typescript
export const SHOP_ITEMS: ShopItem[] = [
  // Membership tiers - Plus/Pro/Premium
  // Each tier has separate entitlement ID - upgrading REPLACES lower tier (no stacking)
  {
    id: 'supporter-basic',
    name: 'Manifold Plus',
    description: '1.5x quest rewards, 1% daily free loans',
    price: 500,
    type: 'time-limited',
    duration: 30 * DAY_MS,
    limit: 'unlimited',
    category: 'badge',
    alwaysEnabled: true,
  },
  {
    id: 'supporter-plus',
    name: 'Manifold Pro',
    description: '2x quest rewards, 5% shop discount, 2% daily free loans, margin loan access',
    price: 2500,
    type: 'time-limited',
    duration: 30 * DAY_MS,
    limit: 'unlimited',
    category: 'badge',
    alwaysEnabled: true,
  },
  {
    id: 'supporter-premium',
    name: 'Manifold Premium',
    description: '3x quest rewards, 10% shop discount, 3% daily free loans, margin loan access, animated badge',
    price: 10000,
    type: 'time-limited',
    duration: 30 * DAY_MS,
    limit: 'unlimited',
    category: 'badge',
    alwaysEnabled: true,
  },
  {
    id: 'avatar-golden-border',
    name: 'Golden Glow',
    price: 25000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-border',
  },
  {
    id: 'avatar-crown',
    name: 'Crown',
    price: 1000000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
  },
  {
    id: 'avatar-graduation-cap',
    name: 'Graduation Cap',
    price: 10000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
  },
  {
    id: 'streak-forgiveness',
    name: 'Streak Freeze',
    price: 500,
    type: 'instant',
    limit: 'unlimited',
    category: 'consumable',
  },
  {
    id: 'pampu-skin',
    name: 'PAMPU Skin',
    price: 1000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'skin',
  },
  {
    id: 'hovercard-glow',
    name: 'Profile Border',
    price: 10000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'hovercard',
  },
]
```

---

## Backend API Endpoints

### shop-purchase
**File**: `backend/api/src/shop-purchase.ts`

**Request**: `{ itemId: string }`

**Flow**:
1. Validate item exists
2. Check user balance
3. Check if already owned (for one-time items)
4. Apply supporter discount (tier-based, except on supporter tiers themselves)
5. Create transaction (deduct mana)
6. Create shop_order record
7. **If exclusive category: Disable all other items in same category**
8. **If supporter tier: DELETE all existing supporter entitlements first**
9. Create/update user_entitlement
10. Return `{ success: true, entitlement, entitlements }` (returns ALL user entitlements)

**Special behaviors**:
- **Supporter tiers: Upgrade REPLACES lower tier** (no stacking across tiers)
- Time-limited items (non-supporter): Expiration stacks on same entitlement
- Instant items (streak freeze): Adds to `user.data.streakForgiveness`
- Supporter discount: Tier-based (Basic: 0%, Plus: 5%, Premium: 10%)
- **Exclusive categories**: Auto-disables other items in same category (see above)

### shop-toggle
**File**: `backend/api/src/shop-toggle.ts`

**Request**: `{ itemId: string, enabled: boolean }`

**Flow**:
1. Validate user owns the item
2. Check item is toggleable (not `alwaysEnabled`)
3. **If enabling and exclusive category: Disable all other items in same category**
4. Update `user_entitlements.enabled`
5. Return `{ success: true, entitlements }` (returns ALL user entitlements)

**Note**: Toggling OFF does not auto-enable anything else - user explicitly chooses what to enable.

### shop-reset-all (Admin Only)
**File**: `backend/api/src/shop-reset-all.ts`

Deletes all user entitlements and refunds mana. For testing only.

---

## Frontend Implementation

### Shop Page
**File**: `web/pages/shop.tsx`

**Components**:
- `SupporterCard` - Premium card for supporter badge with benefits preview
- `ShopItemCard` - Generic card for other items
- `ItemPreview` - Visual preview for each item type
- Various preview components (GoldenBorderPreview, CrownPreview, etc.)

**Features**:
- Optimistic updates after purchase
- Confirmation modal before purchase
- Toggle switches for owned toggleable items
- "OWNED" badge for owned items
- Confetti on purchase
- Links to checkout if insufficient balance

### Optimistic Updates & Race Condition Handling

The shop page uses a sophisticated pattern to ensure smooth, instant UI updates even during rapid toggling:

**1. Optimistic Updates**
When a user toggles an item, the UI updates *immediately* before the server responds:
- The toggled item's state changes instantly
- For exclusive categories, other items in the same category are also disabled instantly
- This creates a smooth, responsive feel

**2. Version Tracking (Race Condition Prevention)**
Problem: If user rapidly toggles Crown → Cap → Crown, stale server responses could overwrite the correct state.

Solution: A version counter (`toggleVersionRef`) tracks each toggle action:
```typescript
const toggleVersionRef = useRef(0)

// On optimistic update:
toggleVersionRef.current += 1
const currentVersion = toggleVersionRef.current

// When server responds:
if (version !== toggleVersionRef.current) {
  return // Stale response - user has toggled again, ignore this
}
setLocalEntitlements(serverEntitlements)
```

**3. Fallback to Server State**
After each toggle, the server response includes ALL user entitlements. If the version matches (no newer toggles happened), we accept the server state as the source of truth.

**Why this matters:**
- Enables instant UI feedback
- Prevents visual glitches during rapid interaction
- Server state is eventually consistent
- Works correctly even with network latency

**Important: Toggle is never disabled during API calls**

The toggle switch is always interactive. We intentionally do NOT disable it during API calls because:
- Optimistic updates make the UI respond instantly
- Version tracking handles race conditions from rapid toggling
- Disabling would make the UI feel sluggish and unresponsive

This allows users to rapidly toggle items without waiting for server responses.

### Key UI Elements

**Shop Header**: "Mana Shop" with gem icon
**Balance Display**: Shows user's mana balance with "Buy mana →" link

**Supporter Card** (premium placement):
- Gold star with glow
- Benefits preview row (4 key benefits)
- Links to `/supporter` page for tier selection
- Shows current tier badge if supporter

**Item Cards** (2-column grid):
- Solid indigo border on hover
- Shadow effect (`shadow-indigo-200/50`)
- Lift animation (`-translate-y-1`)
- Item-specific preview components

---

## Helper Functions

**File**: `common/src/shop/items.ts`

```typescript
// Get item by ID
getShopItem(id: string): ShopItem | undefined

// Get entitlement ID (defaults to item.id)
getEntitlementId(item: ShopItem): string

// Check if entitlement is currently active
isEntitlementActive(entitlement: UserEntitlement): boolean

// Check if user owns an item
hasActiveEntitlement(entitlements, itemId): boolean

// Specific helpers
userHasPampuSkin(entitlements): boolean
userHasHovercardGlow(entitlements): boolean
userHasSupporterBadge(entitlements): boolean  // Checks any of 3 tiers
userHasAvatarDecoration(entitlements, decorationId): boolean
```

**File**: `common/src/supporter-config.ts` (NEW - central supporter config)

```typescript
// Tier definitions
SUPPORTER_TIERS: Record<SupporterTier, { id, name, price, color, ... }>
SUPPORTER_BENEFITS: Record<SupporterTier, { questMultiplier, shopDiscount, ... }>

// Helper functions
getUserSupporterTier(entitlements): SupporterTier | null  // 'basic' | 'plus' | 'premium'
getBenefit(entitlements, benefitKey, defaultValue): BenefitValue
isSupporter(entitlements): boolean
canUpgradeTo(currentTier, targetTier): boolean
getSupporterEntitlement(entitlements): UserEntitlement | null
getMaxStreakFreezes(entitlements): number  // 1 for non-supporter, 2/3/5 for Basic/Plus/Premium
```

---

## How to Add a New Shop Item

### 1. Add Item Definition
In `common/src/shop/items.ts`, add to `SHOP_ITEMS` array:
```typescript
{
  id: 'my-new-item',
  name: 'My New Item',
  description: 'What this item does',
  price: 10000,
  type: 'permanent-toggleable',  // or 'instant', 'time-limited'
  limit: 'one-time',             // or 'unlimited'
  category: 'skin',              // appropriate category
}
```

### 2. Add Preview Component (Optional)
In `web/pages/shop.tsx`, create a preview component:
```typescript
function MyNewItemPreview(props: { user: User | null | undefined }) {
  // Visual preview of what the item looks like
}
```

### 3. Add to ItemPreview Switch
In `web/pages/shop.tsx`, add case to `ItemPreview`:
```typescript
case 'my-new-item':
  return <MyNewItemPreview user={user} />
```

### 4. Add Helper Function (If Needed)
In `common/src/shop/items.ts`:
```typescript
export const userHasMyNewItem = (entitlements) =>
  hasActiveEntitlement(entitlements, 'my-new-item')
```

### 5. Implement Feature Logic
Wherever the feature should activate, check entitlement:
```typescript
if (userHasMyNewItem(user?.entitlements)) {
  // Apply feature
}
```

### 6. Update Documentation
Add item to the Quick Reference table in this document.

---

## How to Change Item Prices

1. Edit `SHOP_ITEMS` in `common/src/shop/items.ts`
2. Find the item by `id`
3. Update the `price` field
4. Update this document's Quick Reference table

---

## How to Remove an Item

1. Remove from `SHOP_ITEMS` array in `common/src/shop/items.ts`
2. Remove preview component from `web/pages/shop.tsx`
3. Remove case from `ItemPreview` switch
4. Remove helper function if it exists
5. Consider: Keep entitlement active for existing owners, or run migration to refund

---

## Item-Specific Implementation Details

### Membership Tiers (Plus/Pro/Premium)
- Central config in `common/src/supporter-config.ts`
- Three separate entitlement IDs: `supporter-basic` (Plus), `supporter-plus` (Pro), `supporter-premium` (Premium)
- **Upgrading REPLACES lower tier** (no stacking across tiers)
- Benefits scale by tier (quest multiplier, shop discount, free loans, streak freezes, etc.)
- Badge colors: Gray (Plus), Indigo (Pro), Amber/Gold (Premium)
- Premium badge animates on hovercard only, static elsewhere
- Dedicated `/supporter` page for tier selection

### Golden Border
- Renders golden glow ring around avatar
- Implementation in `web/components/widgets/avatar.tsx`
- Check with `userHasAvatarDecoration(entitlements, 'avatar-golden-border')`

### Crown / Graduation Cap
- Renders overlay icon on avatar
- Implementation in `web/components/widgets/avatar.tsx`
- Check with `userHasAvatarDecoration(entitlements, 'avatar-crown')` etc.

### Streak Freeze
- Instant item - adds to `user.data.streakForgiveness`
- Used automatically when streak would break
- **Purchase cap based on supporter tier:**
  | Tier | Max Purchasable |
  |------|-----------------|
  | Non-supporter | 1 |
  | Basic | 2 |
  | Plus | 3 |
  | Premium | 5 |
- Monthly grants (+1/month for everyone) can exceed cap - cap only applies to purchases
- When at/above cap: Purchase blocked with "MAX OWNED" error

### PAMPU Skin
- Changes "Yes" button text to "PAMPU" throughout the site
- Check with `userHasPampuSkin(entitlements)`
- Implementation in bet panel components

### Profile Glow
- Adds glowing border to user hovercard/popup
- Check with `userHasHovercardGlow(entitlements)`
- Implementation in hovercard component

---

## Supporter Benefits System

All supporter benefits are centrally configured in `common/src/supporter-config.ts`.

### Benefit Values by Tier

| Benefit | Plus | Pro | Premium | Non-Member |
|---------|------|-----|---------|------------|
| Quest Multiplier | 1.5x | 2x | 3x | 1x |
| Referral Multiplier | 1x | 1.5x | 2x | 1x |
| Shop Discount | 0% | 5% | 10% | 0% |
| Max Streak Freezes | 2 | 3 | 5 | 1 |
| Daily Free Loan Rate | 1% | 2% | 3% | 1% |
| Margin Loan Access | No | Yes | Yes | No |
| Badge Animation | No | No | Hovercard only | No |

### Benefit Implementation Locations

| Benefit | File | How It Works |
|---------|------|--------------|
| Quest Multiplier | `backend/shared/src/complete-quest-internal.ts` | Multiplies quest reward in `awardQuestBonus()` |
| Referral Multiplier | `backend/api/src/refer-user.ts` | Multiplies referrer's bonus (not new user's) |
| Shop Discount | `backend/api/src/shop-purchase.ts` | Applied to all items EXCEPT membership tiers |
| Max Streak Freezes | `backend/api/src/shop-purchase.ts` | Caps how many freezes user can purchase |
| Daily Free Loan Rate | `backend/api/src/request-loan.ts` | Daily free loan as % of portfolio value |
| Margin Loan Access | `backend/api/src/request-loan.ts` | Unlocks margin loans for Pro/Premium |
| Badge Animation | `web/components/user/user-hovercard.tsx` | Premium badge pulses on hovercard only |

### Membership Helper Functions

**File**: `common/src/supporter-config.ts`

```typescript
// Get user's current tier (null if not member)
getUserSupporterTier(entitlements): 'basic' | 'plus' | 'premium' | null
// Note: 'basic' = Plus, 'plus' = Pro, 'premium' = Premium (legacy naming)

// Get specific benefit value for user
getBenefit(entitlements, 'questMultiplier'): number
getBenefit(entitlements, 'shopDiscount'): number
getBenefit(entitlements, 'freeLoanRate'): number
// etc.

// Check if user is any tier of member
isSupporter(entitlements): boolean

// Check if user can upgrade from current tier to target
canUpgradeTo(currentTier, targetTier): boolean

// Get the membership entitlement object
getSupporterEntitlement(entitlements): UserEntitlement | null

// Get tier display info (name, colors, etc.)
getTierInfo(tier): TierConfig

// Get max streak freezes for user
getMaxStreakFreezes(entitlements): number
```

---

## Entitlement Display Configuration

Central configuration system that controls which entitlements (avatar decorations, badges) appear in which areas of the site, and which animations are enabled.

**File**: `common/src/shop/display-config.ts`

### Core Concepts

| Concept | Description |
|---------|-------------|
| **DisplayContext** | Where in the UI entitlements can appear (e.g., `profile_page`, `shop`, `hovercard`) |
| **EntitlementGroup** | Category of visual effect (`avatar-border`, `avatar-overlay`, `badge`, `hovercard`) |
| **AnimationType** | Animation effects (`hat-hover`, `golden-glow`, `badge-pulse`) |

### Fail-Safe Default Behavior

**CRITICAL**: When `displayContext` prop is NOT passed to a component:
- **Avatar**: Shows NO entitlements (border, hats) - filtered to empty
- **UserBadge**: Shows NO supporter badge

This ensures the config controls everything. To enable entitlements in a new area, you MUST add `displayContext` prop.

### Current Configuration

```typescript
const CONTEXT_CONFIG: Record<DisplayContext, ContextConfig> = {
  // ✅ FUNCTIONAL - fully wired with displayContext
  profile_page:     { groups: ['avatar-border', 'avatar-overlay', 'badge'], animations: ['hat-hover'] },
  profile_sidebar:  { groups: ['avatar-border', 'avatar-overlay', 'badge'], animations: ['hat-hover'] },
  shop:             { groups: ['avatar-border', 'avatar-overlay', 'badge'], animations: ['hat-hover', 'golden-glow'] },
  market_creator:   { groups: ['avatar-border', 'avatar-overlay', 'badge'], animations: [] },
  market_comments:  { groups: ['avatar-border', 'avatar-overlay', 'badge'], animations: [] },
  posts:            { groups: ['avatar-border', 'avatar-overlay', 'badge'], animations: [] },
  hovercard:        { groups: ['avatar-border', 'avatar-overlay', 'badge', 'hovercard'], animations: ['hat-hover', 'golden-glow', 'badge-pulse'] },
  leagues:          { groups: ['avatar-border', 'avatar-overlay', 'badge'], animations: [] },
  leaderboard:      { groups: ['avatar-border', 'avatar-overlay'], animations: [] },  // No badges - rows too compact
  managrams:        { groups: ['avatar-border', 'avatar-overlay', 'badge'], animations: [] },

  // ⚠️ NOT YET WIRED - need useDisplayUserById pattern; not necessary for launch
  browse:           { groups: [], animations: [] },
  explore:          { groups: [], animations: [] },
  feed:             { groups: [], animations: [] },

  // ❌ NO EFFECT - notification data doesn't include entitlements
  notifications:    { groups: [], animations: [] },
}
```

### Entitlement Groups Explained

| Group | Visual Effect | Shop Items |
|-------|--------------|------------|
| `avatar-border` | Golden glow ring around avatar | `avatar-golden-border` |
| `avatar-overlay` | Hat icons on avatar (crown, graduation cap) | `avatar-crown`, `avatar-graduation-cap` |
| `badge` | Supporter star badge next to username | `supporter-basic`, `supporter-plus`, `supporter-premium` |
| `hovercard` | Purple glow border on hovercard popup | `hovercard-glow` |

### Animation Types Explained

| Animation | Effect | Where Typically Used |
|-----------|--------|---------------------|
| `hat-hover` | Hat lifts up on hover | Profile pages, shop, hovercard |
| `golden-glow` | Golden border pulses | Shop preview, hovercard |
| `badge-pulse` | Premium badge has pulsing glow | Hovercard only |

### Helper Functions

```typescript
// Filter entitlements for a context (used by Avatar internally)
filterEntitlementsForContext(entitlements, context): UserEntitlement[] | undefined

// Check if badges should show in context (used by UserBadge internally)
shouldShowBadges(context): boolean

// Animation checks (used by Avatar/UserBadge internally)
shouldAnimateHatOnHover(context): boolean
shouldAnimateGoldenGlow(context): boolean
shouldAnimateBadge(context): boolean
```

---

### How to Enable Entitlements for a New Display Area

Follow this checklist when adding entitlements to a new area of the site:

#### Step 1: Add DisplayContext (if new area)

In `common/src/shop/display-config.ts`:

```typescript
// Add to DisplayContext type
export type DisplayContext =
  | 'profile_page'
  | 'my_new_area'  // ← Add here
  // ...

// Add to CONTEXT_CONFIG
const CONTEXT_CONFIG: Record<DisplayContext, ContextConfig> = {
  // ...existing...
  my_new_area: {
    groups: ['avatar-border', 'avatar-overlay', 'badge'],  // Choose which to show
    animations: [],  // Choose which animations
  },
}
```

#### Step 2: Ensure Entitlement Data is Available

The component needs access to `user.entitlements`. There are two patterns:

**Pattern A: User object already has entitlements**
If you have a full `User` or `DisplayUser` object, entitlements are already available:
```typescript
<Avatar
  avatarUrl={user.avatarUrl}
  username={user.username}
  entitlements={user.entitlements}      // ← Pass entitlements
  displayContext="my_new_area"          // ← Pass context
/>
```

**Pattern B: Only have userId - use `useDisplayUserById`**
If you only have a user ID (common in feed items, contracts, etc.):
```typescript
import { useDisplayUserById } from 'web/hooks/use-user-supabase'

function MyComponent({ userId }: { userId: string }) {
  const user = useDisplayUserById(userId)  // ← Fetches user WITH entitlements

  return (
    <Avatar
      avatarUrl={user?.avatarUrl}
      username={user?.username}
      entitlements={user?.entitlements}  // ← Now available
      displayContext="my_new_area"
    />
  )
}
```

#### Step 3: Pass displayContext to Components

**For Avatar (avatar decorations)**:
```typescript
<Avatar
  avatarUrl={user.avatarUrl}
  username={user.username}
  entitlements={user.entitlements}
  displayContext="my_new_area"  // ← REQUIRED for entitlements to show
/>
```

**For UserLink (supporter badge)**:
```typescript
<UserLink
  user={user}
  displayContext="my_new_area"  // ← REQUIRED for badge to show
/>
```

**For UserAvatarAndBadge (both avatar + badge)**:
```typescript
<UserAvatarAndBadge
  user={user}
  displayContext="my_new_area"  // ← Passes to both Avatar and UserLink
/>
```

**For StackedUserNames (profile header style)**:
```typescript
<StackedUserNames
  user={user}
  displayContext="my_new_area"  // ← Passes to UserBadge
/>
```

#### Step 4: Update Config Status Comment

In `display-config.ts`, update the status annotation:
- `// ✅ FUNCTIONAL` - Fully wired, config controls everything
- `// ⚠️ NOT YET WIRED` - Some components missing displayContext
- `// ❌ NO EFFECT` - Data not available, config has no effect

---

### How to Add a New Entitlement Group

When adding a new category of visual entitlement (e.g., a new type of avatar decoration):

#### Step 1: Add the EntitlementGroup type

```typescript
export type EntitlementGroup =
  | 'avatar-border'
  | 'avatar-overlay'
  | 'badge'
  | 'hovercard'
  | 'my-new-group'  // ← Add here
```

#### Step 2: Map ShopItemCategory to EntitlementGroup

In the `categoryToGroup` function:
```typescript
const categoryToGroup = (category: ShopItemCategory): EntitlementGroup | null => {
  switch (category) {
    // ...existing...
    case 'my-new-category':
      return 'my-new-group'
    default:
      return null
  }
}
```

#### Step 3: Enable in desired contexts

Add `'my-new-group'` to the `groups` array for each context where it should appear:
```typescript
profile_page: {
  groups: ['avatar-border', 'avatar-overlay', 'badge', 'my-new-group'],
  animations: ['hat-hover'],
},
```

#### Step 4: Implement rendering in Avatar/UserBadge

The component needs to actually render the new decoration. See `avatar.tsx` for examples of how crown/graduation cap are rendered.

---

### How to Add a New Animation Type

#### Step 1: Add to AnimationType

```typescript
export type AnimationType = 'hat-hover' | 'golden-glow' | 'badge-pulse' | 'my-new-animation'
```

#### Step 2: Create helper function

```typescript
export const shouldAnimateMyNewThing = (context: DisplayContext): boolean => {
  return isAnimationEnabled(context, 'my-new-animation')
}
```

#### Step 3: Enable in desired contexts

```typescript
hovercard: {
  groups: ['avatar-border', 'avatar-overlay', 'badge', 'hovercard'],
  animations: ['hat-hover', 'golden-glow', 'badge-pulse', 'my-new-animation'],  // ← Add here
},
```

#### Step 4: Use in component

```typescript
const animateMyThing = displayContext ? shouldAnimateMyNewThing(displayContext) : false

// Then use animateMyThing to conditionally apply CSS classes/animations
```

---

### Implementation Status by Area

| Area | Status | Notes |
|------|--------|-------|
| Profile page | ✅ | Avatar + badges fully working |
| Profile sidebar | ✅ | Sidebar navigation avatar |
| Shop page | ✅ | Preview cards with animations |
| Market creator | ✅ | Contract details page |
| Market comments | ✅ | Comment section avatars/badges |
| Posts | ✅ | Post author avatars/badges |
| Hovercard | ✅ | Full effects including glow |
| Leagues | ✅ | League standings |
| Leaderboard | ✅ | Compact view - no badges |
| Managrams | ✅ | Payments page |
| Browse | ⚠️ | Needs `useDisplayUserById` for contract creators |
| Explore | ⚠️ | Needs `useDisplayUserById` for contract creators |
| Feed | ⚠️ | Needs `useDisplayUserById` for contract creators |
| Notifications | ❌ | Data doesn't include entitlements |

### Wiring New Areas (browse/explore/feed)

These areas show contract cards where the creator is displayed. The contract object only has basic creator info (`creatorId`, `creatorName`, `creatorAvatarUrl`), NOT entitlements.

**To wire these areas:**

1. In the component that renders the contract card:
```typescript
import { useDisplayUserById } from 'web/hooks/use-user-supabase'

function ContractCard({ contract }: { contract: Contract }) {
  // Fetch full user data with entitlements
  const creator = useDisplayUserById(contract.creatorId)

  return (
    <Avatar
      avatarUrl={creator?.avatarUrl ?? contract.creatorAvatarUrl}
      username={creator?.username ?? contract.creatorUsername}
      entitlements={creator?.entitlements}  // ← Now available
      displayContext="browse"               // ← Enable filtering
    />
  )
}
```

2. Update config status from `⚠️` to `✅`

**Trade-off:** This adds a user fetch per contract card. Consider batching or caching strategies for lists with many cards.

---

## Removed/Skipped Features

Features that were considered but intentionally not implemented. Documented here for future reference.

### Free Boosts Per Month (`freeBoostsPerMonth`)
**Status**: REMOVED from config
**Reason**: Would require monthly entitlement tracking, boost grant scheduler, and purchase flow changes. Complexity not worth the benefit for initial launch.
**If revisiting**: Would need:
- Add `freeBoostsPerMonth` back to `SUPPORTER_BENEFITS` in supporter-config.ts
- Create scheduler job to grant monthly boosts
- Track boost usage in user data (e.g., `user.data.freeBoostsUsedThisMonth`)
- Modify boost purchase logic to check tier benefit
- UI to show remaining free boosts

### Username Color Category
**Status**: REMOVED from `ShopItemCategory`
**Reason**: No items ever used this category. Was placeholder for potential future feature.
**If revisiting**: Add `'username-color'` back to the type union in `items.ts`

### Duration-Based Tier Progression (Bronze/Silver/Gold/Platinum)
**Status**: REPLACED with payment-based tiers (Basic/Plus/Premium)
**Reason**: Simpler model - users choose their tier directly instead of earning it over time based on cumulative supporter days.
**Old system**: Bronze (0+ days), Silver (90+ days), Gold (180+ days), Platinum (365+ days)

### Legacy Helper Functions
**Status**: REMOVED from `supporter.ts`
**Functions removed**: `getQuestReward()`, `getReferralBonus()`, `getShopPrice()`, `getMonthlyStreakFreezes()`
**Reason**: These were never imported anywhere. Backend uses `getBenefit()` from supporter-config.ts directly.

---

## Changelog

| Date | Change | Modified By |
|------|--------|-------------|
| 2026-01-16 | Rebranded tiers to Plus/Pro/Premium, added loan benefits | Claude |
| | - Updated Quick Reference with correct prices and names | |
| | - Added daily free loan rate and margin loan access benefits | |
| | - PAMPU Skin price corrected to M$1,000 | |
| 2026-01-13 | Documentation consolidation | Claude |
| | - Deleted outdated SUPPORTER_SYSTEM.md | |
| | - Added Supporter Benefits System section | |
| | - Added Removed/Skipped Features section | |
| | - Removed username-color category (unused) | |
| | - Updated helper functions with supporter-config.ts exports | |
| 2026-01-13 | Phase 2 supporter system polish | Claude |
| | - Integrated `getBenefit()` for quest/referral multipliers | |
| | - Added streak freeze purchase cap per tier (1/2/3/5) | |
| | - Redesigned /supporter page: horizontal tier selector, benefits table highlighting | |
| | - Redesigned SupporterCard: live badge preview with user entitlements, animated Premium star | |
| | - UI polish: distinct hover vs selected states using box-shadow glow (no focus ring gap) | |
| 2026-01-13 | Supporter system rework: payment-based tiers | Claude |
| | - Replaced 2 time-based items with 3 payment tiers (Basic/Plus/Premium) | |
| | - Basic: M$500/mo, Plus: M$2,500/mo, Premium: M$10,000/mo | |
| | - Upgrading now REPLACES lower tier (no stacking across tiers) | |
| | - New central config: `common/src/supporter-config.ts` | |
| | - Benefits scale by tier (quest mult, discount, streak freezes, etc.) | |
| | - Mobile-first /supporter page with stacked tier cards | |
| | - Shop SupporterCard simplified, links to /supporter | |
| | - Tier-appropriate badge colors (gray/indigo/amber) | |
| 2026-01-13 | Exclusive categories with optimistic updates | Claude |
| | - Added EXCLUSIVE_CATEGORIES for avatar-border, avatar-overlay, hovercard, skin | |
| | - Auto-disable other items in same category on purchase/enable | |
| | - Optimistic UI updates with version tracking for race conditions | |
| | - APIs now return full entitlements array for consistency | |
| 2026-01-12 | Initial shop system implementation | Claude |
| | - Created shop_purchase API | |
| | - Created shop_toggle API | |
| | - Created shop page with item cards | |
| | - Supporter badge, cosmetics, streak freeze | |
| 2026-01-12 | Price adjustments | Claude |
| | - Supporter: M$100k→M$10k (1mo), M$1M→M$100k (1yr) | |
| | - Golden Border: M$125k→M$25k | |
| | - Crown: M$100M→M$1M | |
| | - Graduation Cap: M$100k→M$10k | |
| | - Streak Freeze: M$10k→M$500 | |
| | - PAMPU Skin: M$25k→M$10k | |
| | - Profile Glow: M$75k→M$10k | |
| 2026-01-12 | Shop UI improvements | Claude |
| | - Renamed header to "Mana Shop" | |
| | - Enhanced hover borders (solid indigo + shadow) | |
| | - Redesigned SupporterCard with benefits preview | |
| 2026-01-12 | Supporter benefits update | Claude |
| | - Updated SupporterCard to show "Free Boosts" instead of "2x Referrals" | |
| | - (Referral bonus now starts at Silver tier, Bronze has no bonus) | |

---

## Testing Checklist

- [ ] All items display correctly in shop grid
- [ ] Prices show correctly
- [ ] Purchase flow works for each item type
- [ ] Confirmation modal appears before purchase
- [ ] Owned items show "OWNED" badge
- [ ] Toggle switches work for toggleable items
- [ ] Time-limited items show expiration
- [ ] Instant items (streak freeze) apply immediately
- [ ] Optimistic updates show immediately after purchase
- [ ] Supporter discount applies (tier-based, except on supporter tiers)
- [ ] Insufficient balance shows "Buy mana" button

### Membership Tiers Testing
- [ ] Non-member can purchase any tier from /supporter page
- [ ] Upgrading (Plus→Pro, Pro→Premium) deletes old entitlement
- [ ] Lower tiers hidden when user has higher tier
- [ ] Badge shows correct color: Gray (Plus), Indigo (Pro), Amber (Premium)
- [ ] Premium badge has glow effect but no animation inline
- [ ] Benefits comparison table shows correct values
- [ ] /supporter page works well on mobile (stacked cards)
- [ ] Shop SupporterCard links to /supporter

### Exclusive Categories Testing
- [ ] Purchasing Crown while owning Grad Cap → Cap auto-disables
- [ ] Enabling Crown while Cap is enabled → Cap auto-disables
- [ ] Disabling Crown → Cap stays disabled (no auto-enable)
- [ ] Rapid toggling between Crown/Cap → No visual glitches
- [ ] Sidebar avatar updates immediately on toggle
- [ ] Shop page toggles update immediately (optimistic)

### Streak Freeze Purchase Cap Testing
- [ ] Non-supporter at 1+ freezes → Cannot purchase ("MAX OWNED")
- [ ] Basic supporter at 2+ freezes → Cannot purchase
- [ ] Plus supporter at 3+ freezes → Cannot purchase
- [ ] Premium supporter at 5+ freezes → Cannot purchase
- [ ] User below cap → Can purchase normally
- [ ] Monthly grant exceeds cap → Still works (cap only on purchases)

### Supporter UI Testing
- [ ] /supporter tier selector: Hover shows lighter glow
- [ ] /supporter tier selector: Click/selected shows stronger glow
- [ ] /supporter tier selector: No white gap or black border flash on click
- [ ] Shop SupporterCard: Avatar shows user's entitlements (crown, border, etc.)
- [ ] Shop SupporterCard: Premium star has animated glow effect
- [ ] Shop modal: Same hover/selected distinction as /supporter page
