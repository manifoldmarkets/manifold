import { UserEntitlement } from './types'
import { getShopItem, ShopItemCategory, AnimationType } from './items'

// Entitlement display groups - what categories of visual effects to show
export type EntitlementGroup =
  | 'avatar-border' // Golden glow ring
  | 'avatar-overlay' // Crown, graduation cap (hats)
  | 'avatar-accessory' // Monocle, crystal ball, thought bubbles, stonks
  | 'badge' // Supporter star badge
  | 'hovercard' // Hovercard glow effect

// Display contexts - where entitlements can be shown
export type DisplayContext =
  | 'profile_page'      // User's profile page
  | 'profile_sidebar'   // Sidebar profile summary
  | 'shop'
  | 'market_creator'    // Market creator avatar/badge
  | 'market_comments'   // Comment section avatars/badges
  | 'posts'
  | 'browse'            // Browse markets - not wired, not needed
  | 'hovercard'
  | 'leagues'
  | 'leaderboard'
  | 'feed'
  | 'activity'          // Activity tab on /explore (site-activity.tsx)
  | 'notifications'
  | 'managrams'

// Re-export AnimationType (defined in items.ts to avoid circular imports)
export type { AnimationType } from './items'

// Combined context configuration
type ContextConfig = {
  groups: EntitlementGroup[]
  animations: AnimationType[]
}

// Central configuration: which entitlement groups and animations are shown in each context
// To enable/disable entitlements for an area, just edit this object
//
// IMPLEMENTATION STATUS:
// ✅ = Fully wired up with displayContext
// ⚠️  = Partially wired (some components missing displayContext)
// ❌ = Not wired (no entitlement data available, config has no effect)
//
const CONTEXT_CONFIG: Record<DisplayContext, ContextConfig> = {
  // ✅ FUNCTIONAL
  profile_page: {
    groups: ['avatar-border', 'avatar-overlay', 'avatar-accessory', 'badge'],
    animations: ['hat-hover', 'fire-item'],
  },
  profile_sidebar: {
    groups: ['avatar-border', 'avatar-overlay', 'avatar-accessory', 'badge'],
    animations: ['hat-hover'],
  },
  shop: {
    groups: ['avatar-border', 'avatar-overlay', 'avatar-accessory', 'badge'],
    animations: ['hat-hover', 'golden-glow', 'propeller-spin', 'fire-item'],
  },
  market_creator: {
    groups: ['avatar-border', 'avatar-overlay', 'avatar-accessory', 'badge'],
    animations: [],
  },
  market_comments: {
    groups: ['avatar-border', 'avatar-overlay', 'avatar-accessory', 'badge'],
    animations: [],
  },
  posts: {
    groups: ['avatar-border', 'avatar-overlay', 'avatar-accessory', 'badge'],
    animations: [],
  },
  hovercard: {
    groups: ['avatar-border', 'avatar-overlay', 'avatar-accessory', 'badge', 'hovercard'],
    animations: ['hat-hover', 'golden-glow', 'badge-pulse', 'propeller-spin', 'fire-item'],
  },
  leagues: {
    groups: ['avatar-border', 'avatar-overlay', 'avatar-accessory', 'badge'],
    animations: [],
  },
  leaderboard: {
    groups: ['avatar-border', 'avatar-overlay', 'avatar-accessory'], // No badges - rows too compact
    animations: [],
  },
  managrams: {
    groups: ['badge'],
    animations: [],
  },
  // Activity tab on /explore, live topic feeds
  activity: {
    groups: ['badge'],
    animations: [],
  },
  // Feed tab on /explore (FeedContractCard, RepostFeedCard)
  feed: {
    groups: ['avatar-border', 'avatar-overlay', 'avatar-accessory', 'badge'],
    animations: [],
  },

  // ❌ NOT CONFIGURED - browse markets doesn't need entitlement display
  browse: { groups: [], animations: [] },

  // ❌ NO EFFECT - notification data doesn't include user entitlements; we don't need them here
  notifications: { groups: [], animations: [] },
}

// Map ShopItemCategory to EntitlementGroup
const categoryToGroup = (category: ShopItemCategory): EntitlementGroup | null => {
  switch (category) {
    case 'avatar-border':
      return 'avatar-border'
    case 'avatar-overlay':
      return 'avatar-overlay'
    case 'avatar-accessory':
      return 'avatar-accessory'
    case 'badge':
      return 'badge'
    case 'hovercard':
      return 'hovercard'
    default:
      return null // skin, consumable - not displayed on user visually
  }
}

// Check if a specific group is enabled for a context (internal helper)
const isGroupEnabled = (
  context: DisplayContext,
  group: EntitlementGroup
): boolean => {
  return CONTEXT_CONFIG[context]?.groups.includes(group) ?? false
}

// Filter entitlements to only those that should display in a given context
export const filterEntitlementsForContext = (
  entitlements: UserEntitlement[] | undefined,
  context: DisplayContext
): UserEntitlement[] | undefined => {
  if (!entitlements) return undefined

  const enabledGroups = CONTEXT_CONFIG[context]?.groups
  if (!enabledGroups || enabledGroups.length === 0) return undefined

  const filtered = entitlements.filter((e) => {
    const item = getShopItem(e.entitlementId)
    if (!item) return false

    const group = categoryToGroup(item.category)
    return group && enabledGroups.includes(group)
  })

  return filtered.length > 0 ? filtered : undefined
}

// Check if badges should be shown in a context
export const shouldShowBadges = (context: DisplayContext): boolean => {
  return isGroupEnabled(context, 'badge')
}

// Check if a specific animation is enabled for a context (internal helper)
const isAnimationEnabled = (
  context: DisplayContext,
  animation: AnimationType
): boolean => {
  return CONTEXT_CONFIG[context]?.animations.includes(animation) ?? false
}

// Animation helper functions for components
export const shouldAnimateHatOnHover = (context: DisplayContext): boolean => {
  return isAnimationEnabled(context, 'hat-hover')
}

export const shouldAnimateGoldenGlow = (context: DisplayContext): boolean => {
  return isAnimationEnabled(context, 'golden-glow')
}

export const shouldAnimateBadge = (context: DisplayContext): boolean => {
  return isAnimationEnabled(context, 'badge-pulse')
}

export const shouldAnimatePropeller = (context: DisplayContext): boolean => {
  return isAnimationEnabled(context, 'propeller-spin')
}

export const shouldAnimateFireItem = (context: DisplayContext): boolean => {
  return isAnimationEnabled(context, 'fire-item')
}

// Friendly display names for contexts (used in shop animation labels)
const CONTEXT_DISPLAY_NAMES: Record<DisplayContext, string> = {
  profile_page: 'profile pages',
  profile_sidebar: 'sidebar',
  shop: 'shop',
  market_creator: 'markets',
  market_comments: 'comments',
  posts: 'posts',
  hovercard: 'hovercards',
  leagues: 'leagues',
  leaderboard: 'leaderboard',
  feed: 'feed',
  activity: 'activity',
  browse: 'browse',
  notifications: 'notifications',
  managrams: 'managrams',
}

// Get all contexts where a given animation type is enabled
export const getAnimatedContexts = (
  animationType: AnimationType
): DisplayContext[] => {
  return (
    Object.entries(CONTEXT_CONFIG) as [DisplayContext, ContextConfig][]
  )
    .filter(([_, config]) => config.animations.includes(animationType))
    .map(([context]) => context)
}

// Get human-readable text describing where an item's animations play
// Returns null if the item has no animation types
export const getAnimationLocationText = (
  animationTypes: AnimationType[]
): string | null => {
  if (!animationTypes.length) return null

  // Collect all contexts where ANY of the item's animation types are enabled
  const contexts = new Set<DisplayContext>()
  for (const type of animationTypes) {
    for (const context of getAnimatedContexts(type)) {
      contexts.add(context)
    }
  }

  if (contexts.size === 0) return null

  const names = [...contexts]
    .map((c) => CONTEXT_DISPLAY_NAMES[c])
    .filter(Boolean)
  if (names.length === 0) return null
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} & ${names[1]}`
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}
