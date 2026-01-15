import { DAY_MS } from '../util/time'
import { UserEntitlement } from './types'

export type ShopItemType =
  | 'instant' // Execute immediately (e.g., streak forgiveness)
  | 'time-limited' // Has expiration (e.g., 30-day badge)
  | 'permanent-toggleable' // Owned forever, can enable/disable (e.g., PAMPU skin)
  | 'earned' // Cannot be purchased, must be earned/claimed (e.g., charity champion)

export type ShopItemCategory =
  | 'badge'
  | 'avatar-border'
  | 'avatar-overlay'
  | 'skin'
  | 'consumable'
  | 'hovercard'

// Categories where only one item can be enabled at a time
export const EXCLUSIVE_CATEGORIES: ShopItemCategory[] = [
  'avatar-border',
  'avatar-overlay',
  'hovercard',
  'skin',
]

// Get all entitlement IDs for items in a given category
export const getEntitlementIdsForCategory = (
  category: ShopItemCategory
): string[] => {
  return SHOP_ITEMS.filter((item) => item.category === category).map(
    (item) => item.entitlementId ?? item.id
  )
}

export type ShopItem = {
  id: string
  name: string
  description: string
  price: number // in mana
  type: ShopItemType
  duration?: number // ms, for time-limited items
  limit: 'one-time' | 'unlimited' // per-user purchase limit
  category: ShopItemCategory
  imageUrl?: string
  // Optional: different items can share an entitlement (e.g., 1mo and 1yr supporter badges)
  entitlementId?: string
  // If true, item has no toggle switch (always active when owned)
  alwaysEnabled?: boolean
}

// Get the entitlement ID for a shop item (defaults to item.id)
export const getEntitlementId = (item: ShopItem): string =>
  item.entitlementId ?? item.id

export const SHOP_ITEMS: ShopItem[] = [
  // Membership tiers - Plus/Pro/Premium
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
    description: 'A prestigious golden glow around your avatar',
    price: 25000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-border',
  },
  {
    id: 'avatar-crown',
    name: 'Crown',
    description: 'A royal crown overlay on your avatar',
    price: 1000000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
  },
  {
    id: 'avatar-graduation-cap',
    name: 'Graduation Cap',
    description: 'A scholarly graduation cap on your avatar',
    price: 10000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
  },
  {
    id: 'streak-forgiveness',
    name: 'Streak Freeze',
    description: 'Protect your betting streak - adds one forgiveness point',
    price: 500,
    type: 'instant',
    limit: 'unlimited',
    category: 'consumable',
  },
  {
    id: 'pampu-skin',
    name: 'PAMPU Skin',
    description: 'Replace your YES button with PAMPU everywhere',
    price: 1000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'skin',
  },
  {
    id: 'hovercard-glow',
    name: 'Profile Border',
    description: 'Add a special border effect to your profile popup',
    price: 10000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'hovercard',
  },
  // Special earned items (not purchasable)
  {
    id: 'charity-champion-trophy',
    name: 'Charity Champion Trophy',
    description: 'Exclusive trophy for the #1 ticket buyer in the charity raffle',
    price: 0, // Cannot be purchased
    type: 'earned',
    limit: 'one-time',
    category: 'badge',
  },
]

export const getShopItem = (id: string): ShopItem | undefined =>
  SHOP_ITEMS.find((item) => item.id === id)

// Helper to check if an entitlement is currently active (not expired, enabled)
export const isEntitlementActive = (entitlement: UserEntitlement): boolean => {
  if (entitlement.expiresTime && entitlement.expiresTime < Date.now()) {
    return false
  }
  if (!entitlement.enabled) {
    return false
  }
  return true
}

// Helper to check if user has an active entitlement for an item
export const hasActiveEntitlement = (
  entitlements: UserEntitlement[] | undefined,
  itemId: string
): boolean => {
  if (!entitlements) return false
  const entitlement = entitlements.find((e) => e.entitlementId === itemId)
  if (!entitlement) return false
  return isEntitlementActive(entitlement)
}

// Helper to check if user has PAMPU skin enabled
export const userHasPampuSkin = (
  entitlements: UserEntitlement[] | undefined
): boolean => {
  return hasActiveEntitlement(entitlements, 'pampu-skin')
}

// Helper to check if user has hovercard glow
export const userHasHovercardGlow = (
  entitlements: UserEntitlement[] | undefined
): boolean => {
  return hasActiveEntitlement(entitlements, 'hovercard-glow')
}

// Helper to check if user has any supporter tier active
export const userHasSupporterBadge = (
  entitlements: UserEntitlement[] | undefined
): boolean => {
  return (
    hasActiveEntitlement(entitlements, 'supporter-basic') ||
    hasActiveEntitlement(entitlements, 'supporter-plus') ||
    hasActiveEntitlement(entitlements, 'supporter-premium')
  )
}

// Helper to check if user has a specific avatar decoration
export const userHasAvatarDecoration = (
  entitlements: UserEntitlement[] | undefined,
  decorationId: 'avatar-golden-border' | 'avatar-crown' | 'avatar-graduation-cap'
): boolean => {
  return hasActiveEntitlement(entitlements, decorationId)
}

// Helper to check if user has the charity champion trophy
export const userHasCharityChampionTrophy = (
  entitlements: UserEntitlement[] | undefined
): boolean => {
  return hasActiveEntitlement(entitlements, 'charity-champion-trophy')
}

// Entitlement ID for charity champion trophy
export const CHARITY_CHAMPION_ENTITLEMENT_ID = 'charity-champion-trophy'
