import { DAY_MS } from '../util/time'
import { UserEntitlement } from './types'

export type ShopItemType =
  | 'instant' // Execute immediately (e.g., streak forgiveness)
  | 'time-limited' // Has expiration (e.g., 30-day badge)
  | 'permanent-toggleable' // Owned forever, can enable/disable (e.g., PAMPU skin)

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

// Achievement requirement types
export type AchievementRequirementType =
  | 'streak' // currentBettingStreak
  | 'profit' // total profit
  | 'loss' // total loss (absolute value)
  | 'volume' // total trading volume
  | 'donations' // $ donated to charity
  | 'referrals' // number of referrals

export type AchievementRequirement = {
  type: AchievementRequirementType
  threshold: number
  description: string // e.g., "Reach a 100-day betting streak"
}

// Team for mutual exclusivity (can only equip items from one team at a time)
export type ShopTeam = 'red' | 'green'

// Seasonal availability window
export type SeasonalAvailability = {
  eventDate: { month: number; day: number } // e.g., { month: 12, day: 25 } for Christmas
  daysBuffer: number // 10 = 9 days before and 9 days after, 1 = only on the day
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
  // Achievement requirement to unlock this item (optional)
  requirement?: AchievementRequirement
  // Team affiliation - items from different teams are mutually exclusive (optional)
  team?: ShopTeam
  // Seasonal availability window - can only purchase during this period (optional)
  seasonalAvailability?: SeasonalAvailability
}

// Get the entitlement ID for a shop item (defaults to item.id)
export const getEntitlementId = (item: ShopItem): string =>
  item.entitlementId ?? item.id

export const SHOP_ITEMS: ShopItem[] = [
  // Membership tiers - Plus/Pro/Premium
  {
    id: 'supporter-basic',
    name: 'Manifold Plus',
    description: '1.5x quest rewards, 1% daily free loans, margin loans (2x leverage)',
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
    description: '2x quest rewards, 5% shop discount, 2% daily free loans, margin loans (3x leverage)',
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
    description: '3x quest rewards, 10% shop discount, 3% daily free loans, margin loans (4x leverage), animated badge',
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
    price: 150,
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

// Check if a seasonal item is currently available for purchase
export const isSeasonalItemAvailable = (item: ShopItem): boolean => {
  if (!item.seasonalAvailability) return true // Non-seasonal items always available

  const { eventDate, daysBuffer } = item.seasonalAvailability
  const now = new Date()
  const currentYear = now.getFullYear()

  // Create event date for current year
  const eventThisYear = new Date(currentYear, eventDate.month - 1, eventDate.day)

  // Check if we're within the buffer range
  const bufferDays = daysBuffer - 1 // 10 means 9 before, 9 after (plus the day itself)
  const startDate = new Date(eventThisYear)
  startDate.setDate(startDate.getDate() - bufferDays)
  const endDate = new Date(eventThisYear)
  endDate.setDate(endDate.getDate() + bufferDays)

  // Also check for events that span year boundaries (e.g., Christmas into January)
  const eventLastYear = new Date(currentYear - 1, eventDate.month - 1, eventDate.day)
  const endDateLastYear = new Date(eventLastYear)
  endDateLastYear.setDate(endDateLastYear.getDate() + bufferDays)

  const eventNextYear = new Date(currentYear + 1, eventDate.month - 1, eventDate.day)
  const startDateNextYear = new Date(eventNextYear)
  startDateNextYear.setDate(startDateNextYear.getDate() - bufferDays)

  return (
    (now >= startDate && now <= endDate) ||
    (now <= endDateLastYear) || // End of last year's event
    (now >= startDateNextYear) // Start of next year's event
  )
}

// Get readable availability text for seasonal items
export const getSeasonalAvailabilityText = (item: ShopItem): string | null => {
  if (!item.seasonalAvailability) return null

  const { eventDate, daysBuffer } = item.seasonalAvailability
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  if (daysBuffer === 1) {
    return `Only available on ${months[eventDate.month - 1]} ${eventDate.day}`
  }

  const bufferDays = daysBuffer - 1
  const startDate = new Date(2000, eventDate.month - 1, eventDate.day)
  startDate.setDate(startDate.getDate() - bufferDays)
  const endDate = new Date(2000, eventDate.month - 1, eventDate.day)
  endDate.setDate(endDate.getDate() + bufferDays)

  return `Available ${months[startDate.getMonth()]} ${startDate.getDate()} - ${months[endDate.getMonth()]} ${endDate.getDate()}`
}

// Get all items for a specific team
export const getItemsForTeam = (team: ShopTeam): ShopItem[] => {
  return SHOP_ITEMS.filter((item) => item.team === team)
}

// Get all entitlement IDs for items in a team
export const getEntitlementIdsForTeam = (team: ShopTeam): string[] => {
  return getItemsForTeam(team).map((item) => item.entitlementId ?? item.id)
}

// Get the opposite team
export const getOppositeTeam = (team: ShopTeam): ShopTeam => {
  return team === 'red' ? 'green' : 'red'
}
