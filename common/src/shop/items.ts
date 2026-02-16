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
  | 'avatar-accessory'
  | 'skin'
  | 'consumable'
  | 'hovercard'

// Slot system for mutual exclusivity
// Items with the same slot cannot be enabled simultaneously
// 'unique' slot means no conflicts with anything
export type ShopItemSlot =
  | 'hat' // avatar overlays like hats, ears, horns
  | 'profile-border' // avatar borders
  | 'profile-accessory' // accessories like monocle, thought bubbles
  | 'hovercard-background' // hovercard backgrounds
  | 'hovercard-border' // hovercard effects like glow, spinning border
  | 'button-yes' // YES button customization
  | 'button-no' // NO button customization
  | 'unique' // no conflicts - can be used with any other items
  | 'consumable' // instant-use items
  | 'badge' // badges (can stack)

// Display labels for slots - used in shop UI
export const SLOT_LABELS: Record<ShopItemSlot, string> = {
  hat: 'Hat',
  'profile-border': 'Border',
  'profile-accessory': 'Accessory',
  'hovercard-background': 'Background',
  'hovercard-border': 'Effect',
  'button-yes': 'YES Button',
  'button-no': 'NO Button',
  unique: 'Unique',
  consumable: 'Consumable',
  badge: 'Badge',
}

// Slots that are mutually exclusive (only one item per slot can be enabled)
export const EXCLUSIVE_SLOTS: ShopItemSlot[] = [
  'hat',
  'profile-border',
  'profile-accessory',
  'hovercard-background',
  'hovercard-border',
  'button-yes',
  'button-no',
]

// Get all entitlement IDs for items in a given slot
export const getEntitlementIdsForSlot = (slot: ShopItemSlot): string[] => {
  return SHOP_ITEMS.filter((item) => item.slot === slot).map(
    (item) => item.entitlementId ?? item.id
  )
}

// Get compatible slot names (slots this item can combine with)
export const getCompatibleSlots = (slot: ShopItemSlot): string[] => {
  // Unique items combine with everything
  if (slot === 'unique' || slot === 'consumable' || slot === 'badge') {
    return EXCLUSIVE_SLOTS.map((s) => SLOT_LABELS[s])
  }
  // Exclusive slots combine with other exclusive slots (but not their own)
  return EXCLUSIVE_SLOTS.filter((s) => s !== slot).map((s) => SLOT_LABELS[s])
}

// LEGACY: Categories where only one item can be enabled at a time
// @deprecated Use EXCLUSIVE_SLOTS instead
export const EXCLUSIVE_CATEGORIES: ShopItemCategory[] = [
  'avatar-border',
  'avatar-overlay',
  'avatar-accessory',
  'hovercard',
]

// LEGACY: Display labels for categories
// @deprecated Use SLOT_LABELS instead
export const CATEGORY_LABELS: Record<ShopItemCategory, string> = {
  badge: 'Badge',
  'avatar-border': 'Border',
  'avatar-overlay': 'Hat',
  'avatar-accessory': 'Accessory',
  skin: 'Button Skin',
  consumable: 'Consumable',
  hovercard: 'Hovercard',
}

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
  | 'loan' // negative balance (loan amount)

export type AchievementRequirement = {
  type: AchievementRequirementType
  threshold: number
  description: string // e.g., "Reach a 100-day betting streak"
}

// Team for mutual exclusivity (can only equip items from one team at a time)
export type ShopTeam = 'red' | 'green'

// Animation types — shared with display-config.ts to avoid circular imports
export type AnimationType =
  | 'hat-hover'
  | 'golden-glow'
  | 'badge-pulse'
  | 'propeller-spin'
  | 'fire-item'

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
  // Slot determines mutual exclusivity - items in the same slot can't be enabled together
  // 'unique' slot means no conflicts with anything
  slot: ShopItemSlot
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
  // Animation types this item uses — drives the "Animated on X" display in the shop
  // (contexts are resolved from display-config.ts CONTEXT_CONFIG)
  animationTypes?: AnimationType[]
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
    slot: 'badge',
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
    slot: 'badge',
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
    slot: 'badge',
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
    slot: 'profile-border',
    animationTypes: ['golden-glow'],
  },
  {
    id: 'avatar-crown',
    name: 'Crown',
    description: 'A royal crown overlay — position it left, center, or right',
    price: 1000000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
    slot: 'unique', // Combines with everything
  },
  {
    id: 'avatar-graduation-cap',
    name: 'Graduation Cap',
    description: 'A scholarly graduation cap on your avatar',
    price: 10000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
    slot: 'hat',
  },
  {
    id: 'streak-forgiveness',
    name: 'Streak Freeze',
    description: 'Protect your betting streak - adds one forgiveness point',
    price: 150,
    type: 'instant',
    limit: 'unlimited',
    category: 'consumable',
    slot: 'consumable',
  },
  {
    id: 'pampu-skin',
    name: 'Custom YES Button',
    description: 'Customize your YES button text: PAMPU, BULLISH, LFG, SEND IT, and more',
    price: 1000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'skin',
    slot: 'button-yes',
  },
  {
    id: 'hovercard-glow',
    name: 'Profile Border',
    description: 'Add a special border effect to your profile popup',
    price: 10000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'hovercard',
    slot: 'hovercard-border',
  },
  {
    id: 'hovercard-spinning-border',
    name: 'Spinning Glow Border',
    description: 'An animated spinning border effect on your profile popup',
    price: 50000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'hovercard',
    slot: 'hovercard-border',
  },
  {
    id: 'hovercard-royal-border',
    name: 'Royal Velvet Border',
    description: 'A luxurious red velvet curtain border with gold trim, fit for royalty',
    price: 75000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'hovercard',
    slot: 'hovercard-border',
  },
  {
    id: 'hovercard-royalty',
    name: 'Royalty Background',
    description: 'A regal purple and gold background for your profile popup',
    price: 75000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'hovercard',
    slot: 'hovercard-background',
  },
  {
    id: 'hovercard-mana-printer',
    name: 'Mana Printer Background',
    description: 'Money go brrr - a green money-themed background',
    price: 50000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'hovercard',
    slot: 'hovercard-background',
  },
  {
    id: 'hovercard-oracle',
    name: 'Starfield Background',
    description: 'A mystical starfield background with twinkling stars',
    price: 100000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'hovercard',
    slot: 'hovercard-background',
  },
  {
    id: 'hovercard-trading-floor',
    name: 'Trading Floor Background',
    description: 'A stock ticker aesthetic for the serious trader',
    price: 75000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'hovercard',
    slot: 'hovercard-background',
  },
  {
    id: 'hovercard-golden-follow',
    name: 'Golden Follow Button',
    description: 'Make the Follow button on your hovercard shine gold',
    price: 40000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'hovercard',
    slot: 'unique',
  },
  {
    id: 'custom-no-button',
    name: 'Custom NO Button',
    description: 'Customize your NO button text: BEARISH, GUH, NAH, DUMPU, and more',
    price: 1000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'skin',
    slot: 'button-no',
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
    slot: 'hat',
  },
  {
    id: 'avatar-halo',
    name: 'Halo',
    description: 'A golden halo for the most virtuous forecasters',
    price: 100000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
    slot: 'unique',
  },
  {
    id: 'avatar-propeller-hat',
    name: 'Propeller Hat',
    description: 'A propeller hat for the playful predictor',
    price: 25000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
    slot: 'hat',
    animationTypes: ['propeller-spin'],
  },
  {
    id: 'avatar-wizard-hat',
    name: 'Wizard Hat',
    description: 'A mystical wizard hat for the oracle of markets',
    price: 150000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
    slot: 'hat',
  },
  {
    id: 'avatar-tinfoil-hat',
    name: 'Tinfoil Hat',
    description: 'For the contrarian who knows the truth',
    price: 15000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
    slot: 'hat',
  },
  {
    id: 'avatar-microphone',
    name: 'Microphone',
    description: 'Drop the mic on your predictions',
    price: 20000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
    slot: 'hat',
  },
  {
    id: 'avatar-jester-hat',
    name: 'Jester Hat',
    description: 'A colorful jester hat with jingling bells',
    price: 20000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
    slot: 'hat',
  },
  {
    id: 'avatar-fedora',
    name: 'Fedora',
    description: 'A classic felt fedora for the smooth operator',
    price: 30000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
    slot: 'hat',
  },
  {
    id: 'avatar-devil-horns',
    name: 'Devil Horns',
    description: 'Devilish horns for the market manipulator',
    price: 100000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
    slot: 'hat',
  },
  {
    id: 'avatar-angel-wings',
    name: 'Angel Wings',
    description: 'Feathered wings flanking your avatar',
    price: 150000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-border',
    slot: 'unique', // Combines with everything
  },
  {
    id: 'avatar-mana-aura',
    name: 'Mana Aura',
    description: 'A mystical purple-blue energy field around your avatar',
    price: 75000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-border',
    slot: 'profile-border',
  },
  {
    id: 'avatar-black-hole',
    name: 'Black Hole',
    description: 'A dark swirling void pulling in light around your avatar',
    price: 200000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-border',
    slot: 'profile-border',
  },
  {
    id: 'avatar-fire-item',
    name: 'Flames',
    description: 'Blazing flames on your avatar',
    price: 150000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-accessory',
    slot: 'profile-accessory',
    animationTypes: ['fire-item'],
    requirement: {
      type: 'streak',
      threshold: 1,
      description: 'Reach a 1-day betting streak',
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
    slot: 'profile-border',
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
    slot: 'profile-accessory',
  },
  {
    id: 'avatar-crystal-ball',
    name: 'Crystal Ball',
    description: 'Gaze into the future with your mystical crystal ball',
    price: 75000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-accessory',
    slot: 'profile-accessory',
  },
  {
    id: 'avatar-disguise',
    name: 'Disguise',
    description: 'When you need to hide from creditors',
    price: 10000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-accessory',
    slot: 'profile-accessory',
    requirement: {
      type: 'loan',
      threshold: 100000,
      description: 'Owe at least M$100,000',
    },
  },
  {
    id: 'avatar-thought-yes',
    name: 'YES Thought Bubble',
    description: 'Show the world what you are thinking',
    price: 25000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-accessory',
    slot: 'profile-accessory',
  },
  {
    id: 'avatar-thought-no',
    name: 'NO Thought Bubble',
    description: 'Let everyone know your stance',
    price: 25000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-accessory',
    slot: 'profile-accessory',
  },
  {
    id: 'avatar-stonks-up',
    name: 'Arrow Up',
    description: 'A green up arrow showing your bullish stance',
    price: 50000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-accessory',
    slot: 'profile-accessory',
    requirement: {
      type: 'profit',
      threshold: 100000,
      description: 'Earn M$100k in total profit',
    },
  },
  {
    id: 'avatar-stonks-down',
    name: 'Arrow Down',
    description: 'A red down arrow for the bearish predictor',
    price: 50000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-accessory',
    slot: 'profile-accessory',
    requirement: {
      type: 'loss',
      threshold: 100000,
      description: 'Lose M$100k in total (a badge of honor)',
    },
  },
  {
    id: 'avatar-stonks-meme',
    name: 'Stonks',
    description: 'The iconic diagonal stonks arrow - for when your portfolio is going to the moon',
    price: 75000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-accessory',
    slot: 'profile-accessory',
    requirement: {
      type: 'profit',
      threshold: 250000,
      description: 'Earn M$250k in total profit',
    },
  },
  // Blue cap — MANA branded cap in blue with style variants
  {
    id: 'avatar-blue-cap',
    name: 'Blue Cap',
    description: 'A sleek blue MANA cap with dark stitch accents',
    price: 25000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
    slot: 'hat',
  },
  // Team items - mutually exclusive (can only equip one team's items)
  {
    id: 'avatar-team-red-hat',
    name: 'Red Cap',
    description: 'Show your allegiance to Team Red',
    price: 25000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
    slot: 'hat',
    team: 'red',
  },
  {
    id: 'avatar-team-green-hat',
    name: 'Green Cap',
    description: 'Show your allegiance to Team Green',
    price: 25000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
    slot: 'hat',
    team: 'green',
  },
  {
    id: 'avatar-black-cap',
    name: 'Black Cap',
    description: 'A sleek black MANA cap with panel seams',
    price: 25000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
    slot: 'hat',
  },
  {
    id: 'avatar-team-red-border',
    name: 'Red Border',
    description: 'A fiery red border for Team Red supporters',
    price: 50000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-border',
    slot: 'profile-border',
    team: 'red',
  },
  {
    id: 'avatar-team-green-border',
    name: 'Green Border',
    description: 'A verdant green border for Team Green supporters',
    price: 50000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-border',
    slot: 'profile-border',
    team: 'green',
  },
  // Achievement-gated hats
  {
    id: 'avatar-bull-horns',
    name: 'Bull Horns',
    description: 'Mighty bull horns for the profitable trader',
    price: 100000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
    slot: 'hat',
    requirement: {
      type: 'profit',
      threshold: 100000,
      description: 'Earn M$100k in total profit',
    },
  },
  {
    id: 'avatar-bear-ears',
    name: 'Bear Ears',
    description: 'Fluffy bear ears for the seasoned trader who has weathered losses',
    price: 100000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
    slot: 'hat',
    requirement: {
      type: 'loss',
      threshold: 100000,
      description: 'Lose M$100k in total (a badge of experience)',
    },
  },
  {
    id: 'avatar-cat-ears',
    name: 'Cat Ears',
    description: 'Cute pointed cat ears for the curious trader',
    price: 30000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
    slot: 'hat',
  },
  // Seasonal items - only available during their season
  {
    id: 'avatar-santa-hat',
    name: 'Santa Hat',
    description: 'A festive Santa hat for the holiday season',
    price: 10000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
    slot: 'hat',
    seasonalAvailability: {
      eventDate: { month: 12, day: 25 }, // Christmas
      daysBuffer: 21, // Dec 4 - Jan 15
    },
  },
  {
    id: 'avatar-bunny-ears',
    name: 'Bunny Ears',
    description: 'Adorable bunny ears for spring celebrations',
    price: 10000,
    type: 'permanent-toggleable',
    limit: 'one-time',
    category: 'avatar-overlay',
    slot: 'hat',
    seasonalAvailability: {
      eventDate: { month: 4, day: 1 }, // Early April (Easter-ish)
      daysBuffer: 14, // Mar 18 - Apr 15
    },
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
    slot: 'badge',
  },
  {
    id: 'former-charity-champion',
    name: "Champion's Legacy",
    description:
      'A trophy-themed hovercard background for former and current Charity Champions',
    price: 0, // Cannot be purchased - earned by claiming the trophy
    type: 'earned',
    limit: 'one-time',
    category: 'hovercard',
    slot: 'hovercard-background',
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

// Crown position options (matches cap style pattern)
// 0: Right (default), 1: Left, 2: Center
// Order allows smooth directional cycling: Right → Left → Center
export const CROWN_POSITION_OPTIONS = ['Right', 'Left', 'Center'] as const
export type CrownPosition = 0 | 1 | 2

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

// Helper to check if user has custom YES button with PAMPU selected
export const userHasPampuSkin = (
  entitlements: UserEntitlement[] | undefined
): boolean => {
  return getCustomYesButtonText(entitlements) === 'PAMPU'
}

// Get the user's custom YES button text (if they have the entitlement and it's enabled)
export const getCustomYesButtonText = (
  entitlements: UserEntitlement[] | undefined
): YesButtonOption | null => {
  if (!entitlements) return null

  const customYes = entitlements.find((e) => e.entitlementId === 'pampu-skin')
  if (customYes && isEntitlementActive(customYes)) {
    const selected = customYes.metadata?.selectedText as YesButtonOption | undefined
    return selected ?? 'PAMPU' // Default to PAMPU if no selection
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

// Get the user's crown position/style (0: Right, 1: Center, 2: Left)
export const getCrownPosition = (
  entitlements: UserEntitlement[] | undefined
): CrownPosition => {
  if (!entitlements) return 0 // Default to right

  const crown = entitlements.find((e) => e.entitlementId === 'avatar-crown')
  if (crown && isEntitlementActive(crown)) {
    const style = crown.metadata?.style as number | undefined
    if (style === 1 || style === 2) return style as CrownPosition
  }

  return 0 // Default to right (original position)
}

// Helper to check if user has hovercard glow
export const userHasHovercardGlow = (
  entitlements: UserEntitlement[] | undefined
): boolean => {
  return hasActiveEntitlement(entitlements, 'hovercard-glow')
}

// Helper to check if user has spinning hovercard border
export const userHasHovercardSpinningBorder = (
  entitlements: UserEntitlement[] | undefined
): boolean => {
  return hasActiveEntitlement(entitlements, 'hovercard-spinning-border')
}

// Helper to check if user has royal velvet border
export const userHasHovercardRoyalBorder = (
  entitlements: UserEntitlement[] | undefined
): boolean => {
  return hasActiveEntitlement(entitlements, 'hovercard-royal-border')
}

// Hovercard background types
export type HovercardBackground =
  | 'royalty'
  | 'mana-printer'
  | 'oracle'
  | 'trading-floor'
  | 'champions-legacy'

// Get the active hovercard background if any
export const getActiveHovercardBackground = (
  entitlements: UserEntitlement[] | undefined
): HovercardBackground | null => {
  if (!entitlements) return null
  if (hasActiveEntitlement(entitlements, 'hovercard-royalty')) return 'royalty'
  if (hasActiveEntitlement(entitlements, 'hovercard-mana-printer'))
    return 'mana-printer'
  if (hasActiveEntitlement(entitlements, 'hovercard-oracle')) return 'oracle'
  if (hasActiveEntitlement(entitlements, 'hovercard-trading-floor'))
    return 'trading-floor'
  if (hasActiveEntitlement(entitlements, 'former-charity-champion'))
    return 'champions-legacy'
  return null
}

// Helper to check if user has golden follow button
export const userHasGoldenFollowButton = (
  entitlements: UserEntitlement[] | undefined
): boolean => {
  return hasActiveEntitlement(entitlements, 'hovercard-golden-follow')
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
  | 'avatar-fire-item'
  | 'avatar-bad-aura'
  | 'avatar-monocle'
  | 'avatar-crystal-ball'
  | 'avatar-disguise'
  | 'avatar-thought-yes'
  | 'avatar-thought-no'
  | 'avatar-stonks-up'
  | 'avatar-stonks-down'
  | 'avatar-stonks-meme'
  | 'avatar-blue-cap'
  | 'avatar-team-red-hat'
  | 'avatar-team-green-hat'
  | 'avatar-black-cap'
  | 'avatar-team-red-border'
  | 'avatar-team-green-border'
  | 'avatar-bull-horns'
  | 'avatar-bear-ears'
  | 'avatar-cat-ears'
  | 'avatar-santa-hat'
  | 'avatar-bunny-ears'

// Helper to check if user has a specific avatar decoration
export const userHasAvatarDecoration = (
  entitlements: UserEntitlement[] | undefined,
  decorationId: AvatarDecorationId
): boolean => {
  return hasActiveEntitlement(entitlements, decorationId)
}

// Check if user has the halo (unique slot - combines with other hats)
export const userHasHalo = (
  entitlements: UserEntitlement[] | undefined
): boolean => {
  return hasActiveEntitlement(entitlements, 'avatar-halo')
}

// Get the style variant number for the active overlay (stored in entitlement metadata)
export const getOverlayStyle = (
  entitlements: UserEntitlement[] | undefined,
  overlayId: AvatarDecorationId | null
): number => {
  if (!overlayId || !entitlements) return 0
  const ent = entitlements.find(
    (e) => e.entitlementId === overlayId && e.enabled
  )
  return (ent?.metadata?.style as number) ?? 0
}

// Check if user has the crown (unique slot - combines with other hats)
export const userHasCrown = (
  entitlements: UserEntitlement[] | undefined
): boolean => {
  return hasActiveEntitlement(entitlements, 'avatar-crown')
}

// Get the active avatar overlay (hat) if any
// Note: This excludes halo and crown since they're unique slot items that combine with other hats
// Use userHasHalo() and userHasCrown() separately to check for those
export const getActiveAvatarOverlay = (
  entitlements: UserEntitlement[] | undefined
): AvatarDecorationId | null => {
  const overlays: AvatarDecorationId[] = [
    // Note: crown excluded here - check separately with userHasCrown()
    'avatar-graduation-cap',
    'avatar-top-hat',
    // Note: halo excluded here - check separately with userHasHalo()
    'avatar-propeller-hat',
    'avatar-wizard-hat',
    'avatar-tinfoil-hat',
    'avatar-microphone',
    'avatar-jester-hat',
    'avatar-fedora',
    'avatar-devil-horns',
    'avatar-blue-cap',
    'avatar-team-red-hat',
    'avatar-team-green-hat',
    'avatar-black-cap',
    'avatar-bull-horns',
    'avatar-bear-ears',
    'avatar-cat-ears',
    'avatar-santa-hat',
    'avatar-bunny-ears',
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
    'avatar-disguise',
    'avatar-thought-yes',
    'avatar-thought-no',
    'avatar-stonks-up',
    'avatar-stonks-down',
    'avatar-stonks-meme',
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

// Entitlement ID for charity champion trophy
export const CHARITY_CHAMPION_ENTITLEMENT_ID = 'charity-champion-trophy'

// Entitlement ID for former charity champion (permanent, earned on claim)
export const FORMER_CHARITY_CHAMPION_ENTITLEMENT_ID = 'former-charity-champion'

// Helper to check if user has the charity champion trophy
export const userHasCharityChampionTrophy = (
  entitlements: UserEntitlement[] | undefined
): boolean => {
  return hasActiveEntitlement(entitlements, CHARITY_CHAMPION_ENTITLEMENT_ID)
}
