import { DAY_MS } from '../util/time'

export type ShopItemType =
  | 'instant' // Execute immediately (e.g., streak forgiveness)
  | 'time-limited' // Has expiration (e.g., 30-day badge)
  | 'permanent-toggleable' // Owned forever, can enable/disable (e.g., PAMPU skin)

export type ShopItemCategory =
  | 'badge'
  | 'avatar-border'
  | 'avatar-overlay'
  | 'username-color'
  | 'skin'
  | 'consumable'
  | 'hovercard'

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
}

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: 'supporter-badge-30d',
    name: 'Manifold Supporter (1 month)',
    description: 'Show your support with a badge next to your name for 30 days',
    price: 100000, // 100k mana
    type: 'time-limited',
    duration: 30 * DAY_MS,
    limit: 'unlimited', // can re-purchase when expired
    category: 'badge',
  },
  {
    id: 'supporter-badge-1y',
    name: 'Manifold Supporter (1 year)',
    description: 'Show your support with a badge next to your name for a full year',
    price: 1000000, // 1M mana (slight discount vs 12x monthly)
    type: 'time-limited',
    duration: 365 * DAY_MS,
    limit: 'unlimited',
    category: 'badge',
  },
  {
    id: 'avatar-golden-border',
    name: 'Golden Border',
    description: 'A prestigious golden glow around your avatar',
    price: 125000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-border',
  },
  {
    id: 'avatar-crown',
    name: 'Crown',
    description: 'A royal crown overlay on your avatar',
    price: 100000000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
  },
  {
    id: 'avatar-graduation-cap',
    name: 'Graduation Cap',
    description: 'A scholarly graduation cap on your avatar',
    price: 100000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
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
    description: 'Replace your YES button with PAMPU everywhere',
    price: 25000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'skin',
  },
  {
    id: 'hovercard-glow',
    name: 'Profile Glow',
    description: 'Add a glowing border to your profile popup',
    price: 75000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'hovercard',
  },
]

export const getShopItem = (id: string): ShopItem | undefined =>
  SHOP_ITEMS.find((item) => item.id === id)

// Helper to check if a purchase is currently active (not expired)
export const isPurchaseActive = (purchase: {
  expiresAt?: number
  enabled?: boolean
}): boolean => {
  if (purchase.expiresAt && purchase.expiresAt < Date.now()) {
    return false
  }
  // For toggleable items, check enabled flag (default to true if not set)
  if (purchase.enabled === false) {
    return false
  }
  return true
}

// Helper to check if user owns an active instance of an item
export const userOwnsItem = (
  shopPurchases: Array<{ itemId: string; expiresAt?: number; enabled?: boolean }> | undefined,
  itemId: string
): boolean => {
  if (!shopPurchases) return false
  return shopPurchases.some(
    (p) => p.itemId === itemId && isPurchaseActive(p)
  )
}

// Helper to check if user has PAMPU skin enabled
export const userHasPampuSkin = (
  shopPurchases: Array<{ itemId: string; expiresAt?: number; enabled?: boolean }> | undefined
): boolean => {
  return userOwnsItem(shopPurchases, 'pampu-skin')
}

// Helper to check if user has hovercard glow
export const userHasHovercardGlow = (
  shopPurchases: Array<{ itemId: string; expiresAt?: number; enabled?: boolean }> | undefined
): boolean => {
  return userOwnsItem(shopPurchases, 'hovercard-glow')
}
