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
  | 'avatar-accessory'
  | 'skin'
  | 'consumable'
  | 'hovercard'

// Categories where only one item can be enabled at a time
export const EXCLUSIVE_CATEGORIES: ShopItemCategory[] = [
  'avatar-border',
  'avatar-overlay',
  'avatar-accessory',
  'hovercard',
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
  // Explicit conflicts - entitlement IDs that must be disabled when this item is enabled
  // (for items that affect the same slot but aren't in the same exclusive category)
  conflicts?: string[]
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
    conflicts: ['custom-yes-button'],
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
  {
    id: 'custom-yes-button',
    name: 'Custom YES Button',
    description: 'Customize your YES button text: PAMPU, BULLISH, LFG, SEND IT, and more',
    price: 5000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'skin',
    conflicts: ['pampu-skin'],
  },
  {
    id: 'custom-no-button',
    name: 'Custom NO Button',
    description: 'Customize your NO button text: BEARISH, GUH, NAH, DUMPU, and more',
    price: 5000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'skin',
  },
  // Hats
  {
    id: 'avatar-top-hat',
    name: 'Top Hat',
    description: 'A distinguished top hat for the refined predictor',
    price: 50000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
  },
  {
    id: 'avatar-halo',
    name: 'Halo',
    description: 'A golden halo for the most virtuous forecasters',
    price: 100000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
  },
  {
    id: 'avatar-propeller-hat',
    name: 'Propeller Hat',
    description: 'A propeller hat for the playful predictor (animated on shop & hovercard)',
    price: 25000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
  },
  {
    id: 'avatar-wizard-hat',
    name: 'Wizard Hat',
    description: 'A mystical wizard hat for the oracle of markets',
    price: 150000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
  },
  {
    id: 'avatar-tinfoil-hat',
    name: 'Tinfoil Hat',
    description: 'For the contrarian who knows the truth',
    price: 15000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
  },
  {
    id: 'avatar-microphone',
    name: 'Microphone',
    description: 'Drop the mic on your predictions',
    price: 20000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
  },
  {
    id: 'avatar-jester-hat',
    name: 'Jester Hat',
    description: 'A colorful jester hat with jingling bells',
    price: 20000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
  },
  {
    id: 'avatar-fedora',
    name: 'Fedora',
    description: 'A classic felt fedora for the smooth operator',
    price: 30000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
  },
  {
    id: 'avatar-devil-horns',
    name: 'Devil Horns',
    description: 'Devilish horns for the market manipulator',
    price: 100000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
  },
  {
    id: 'avatar-angel-wings',
    name: 'Angel Wings',
    description: 'Feathered wings flanking your avatar',
    price: 150000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-border',
  },
  {
    id: 'avatar-mana-aura',
    name: 'Mana Aura',
    description: 'A mystical purple-blue energy field around your avatar',
    price: 75000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-border',
  },
  {
    id: 'avatar-black-hole',
    name: 'Black Hole',
    description: 'A dark swirling void pulling in light around your avatar',
    price: 200000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-border',
  },
  {
    id: 'avatar-fire-ring',
    name: 'Fire Ring',
    description: 'A blazing ring of fire around your avatar',
    price: 150000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-border',
    requirement: {
      type: 'streak',
      threshold: 100,
      description: 'Reach a 100-day betting streak',
    },
  },
  {
    id: 'avatar-bad-aura',
    name: 'Bad Aura',
    description: 'A menacing crimson glow around your avatar',
    price: 25000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-border',
  },
  // Avatar Accessories
  {
    id: 'avatar-monocle',
    name: 'Monocle',
    description: 'A distinguished monocle for the discerning forecaster',
    price: 35000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-accessory',
  },
  {
    id: 'avatar-crystal-ball',
    name: 'Crystal Ball',
    description: 'Gaze into the future with your mystical crystal ball',
    price: 75000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-accessory',
  },
  {
    id: 'avatar-thought-yes',
    name: 'YES Thought Bubble',
    description: 'Show the world what you are thinking',
    price: 25000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-accessory',
  },
  {
    id: 'avatar-thought-no',
    name: 'NO Thought Bubble',
    description: 'Let everyone know your stance',
    price: 25000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-accessory',
  },
  {
    id: 'avatar-stonks-up',
    name: 'Stonks Up',
    description: 'The classic stonks guy for the profitable trader',
    price: 50000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-accessory',
    requirement: {
      type: 'profit',
      threshold: 100000,
      description: 'Earn M$100k in total profit',
    },
  },
  {
    id: 'avatar-stonks-down',
    name: 'Stonks Down',
    description: 'Embrace the loss with the inverse stonks guy',
    price: 50000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-accessory',
    requirement: {
      type: 'loss',
      threshold: 100000,
      description: 'Lose M$100k in total (a badge of honor)',
    },
  },
]

// Available options for custom button text
export const YES_BUTTON_OPTIONS = [
  'YES',
  'PAMPU',
  'BULLISH',
  'LFG',
  'SEND IT',
  'TO THE MOON',
  'BUY',
  'LONG',
] as const

export const NO_BUTTON_OPTIONS = [
  'NO',
  'DUMPU',
  'BEARISH',
  'GUH',
  'NAH',
  'SELL',
  'SHORT',
  'RIP',
] as const

export type YesButtonOption = (typeof YES_BUTTON_OPTIONS)[number]
export type NoButtonOption = (typeof NO_BUTTON_OPTIONS)[number]

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

// Helper to check if user has PAMPU skin enabled (legacy - use getCustomYesButtonText instead)
export const userHasPampuSkin = (
  entitlements: UserEntitlement[] | undefined
): boolean => {
  // Check legacy PAMPU skin first
  if (hasActiveEntitlement(entitlements, 'pampu-skin')) return true
  // Also check if custom YES button is set to PAMPU
  return getCustomYesButtonText(entitlements) === 'PAMPU'
}

// Get the user's custom YES button text (if they have the entitlement and it's enabled)
export const getCustomYesButtonText = (
  entitlements: UserEntitlement[] | undefined
): YesButtonOption | null => {
  if (!entitlements) return null

  // Check custom-yes-button entitlement
  const customYes = entitlements.find((e) => e.entitlementId === 'custom-yes-button')
  if (customYes && isEntitlementActive(customYes)) {
    const selected = customYes.metadata?.selectedText as YesButtonOption | undefined
    return selected ?? 'PAMPU' // Default to PAMPU if no selection
  }

  // Fallback: check legacy pampu-skin
  if (hasActiveEntitlement(entitlements, 'pampu-skin')) {
    return 'PAMPU'
  }

  return null
}

// Get the user's custom NO button text (if they have the entitlement and it's enabled)
export const getCustomNoButtonText = (
  entitlements: UserEntitlement[] | undefined
): NoButtonOption | null => {
  if (!entitlements) return null

  const customNo = entitlements.find((e) => e.entitlementId === 'custom-no-button')
  if (customNo && isEntitlementActive(customNo)) {
    const selected = customNo.metadata?.selectedText as NoButtonOption | undefined
    return selected ?? 'DUMPU' // Default to DUMPU if no selection
  }

  return null
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

// All avatar decoration IDs (overlays and borders)
export type AvatarDecorationId =
  | 'avatar-golden-border'
  | 'avatar-crown'
  | 'avatar-graduation-cap'
  | 'avatar-top-hat'
  | 'avatar-halo'
  | 'avatar-propeller-hat'
  | 'avatar-wizard-hat'
  | 'avatar-tinfoil-hat'
  | 'avatar-microphone'
  | 'avatar-jester-hat'
  | 'avatar-fedora'
  | 'avatar-devil-horns'
  | 'avatar-angel-wings'
  | 'avatar-mana-aura'
  | 'avatar-black-hole'
  | 'avatar-fire-ring'
  | 'avatar-bad-aura'
  | 'avatar-monocle'
  | 'avatar-crystal-ball'
  | 'avatar-thought-yes'
  | 'avatar-thought-no'
  | 'avatar-stonks-up'
  | 'avatar-stonks-down'

// Helper to check if user has a specific avatar decoration
export const userHasAvatarDecoration = (
  entitlements: UserEntitlement[] | undefined,
  decorationId: AvatarDecorationId
): boolean => {
  return hasActiveEntitlement(entitlements, decorationId)
}

// Get the active avatar overlay (hat) if any
export const getActiveAvatarOverlay = (
  entitlements: UserEntitlement[] | undefined
): AvatarDecorationId | null => {
  const overlays: AvatarDecorationId[] = [
    'avatar-crown',
    'avatar-graduation-cap',
    'avatar-top-hat',
    'avatar-halo',
    'avatar-propeller-hat',
    'avatar-wizard-hat',
    'avatar-tinfoil-hat',
    'avatar-microphone',
    'avatar-jester-hat',
    'avatar-fedora',
    'avatar-devil-horns',
  ]
  for (const overlay of overlays) {
    if (hasActiveEntitlement(entitlements, overlay)) {
      return overlay
    }
  }
  return null
}

// Get the active avatar accessory if any
export const getActiveAvatarAccessory = (
  entitlements: UserEntitlement[] | undefined
): AvatarDecorationId | null => {
  const accessories: AvatarDecorationId[] = [
    'avatar-monocle',
    'avatar-crystal-ball',
    'avatar-thought-yes',
    'avatar-thought-no',
    'avatar-stonks-up',
    'avatar-stonks-down',
  ]
  for (const accessory of accessories) {
    if (hasActiveEntitlement(entitlements, accessory)) {
      return accessory
    }
  }
  return null
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
