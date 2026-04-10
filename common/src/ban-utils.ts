/**
 * Ban System Utilities
 *
 * See backend/api/knowledge.md for full documentation on the ban system.
 *
 * Ban Types:
 * - 'posting': blocks comments, messages, posts, answers, poll votes, managrams
 * - 'marketControl': blocks creating/editing/resolving markets, hiding comments, answers, topics
 * - 'trading': blocks betting, managrams, liquidity, answers, poll votes
 * - 'purchase': blocks purchasing mana
 * - 'modAlert': does NOT block any actions, used for audit logging of mod alerts
 *
 * To add a new bannable action:
 * 1. Add the action name to getBanTypesForAction() below
 * 2. Use onlyUsersWhoCanPerformAction('actionName', handler) in your endpoint
 */

import { BanType, UserBan } from './user'

export type { BanType } from './user'

// Check if a specific ban is currently active (not expired, not ended)
export function isBanActive(ban: UserBan): boolean {
  // Ban was manually ended
  if (ban.ended_at) return false

  // Check if temp ban has expired
  if (ban.end_time) {
    return new Date(ban.end_time).getTime() > Date.now()
  }

  // Permanent ban that hasn't been ended
  return true
}

// Check if user has an active ban of a specific type
export function isUserBanned(bans: UserBan[], banType: BanType): boolean {
  return bans.some(ban => ban.ban_type === banType && isBanActive(ban))
}

// Get the active ban for a specific type (if any)
export function getActiveBan(bans: UserBan[], banType: BanType): UserBan | undefined {
  return bans.find(ban => ban.ban_type === banType && isBanActive(ban))
}

// Get ban message/reason for a specific ban type
export function getUserBanMessage(bans: UserBan[], banType: BanType): string | undefined {
  const activeBan = getActiveBan(bans, banType)
  return activeBan?.reason ?? undefined
}

// Get time remaining for a temp ban (in ms)
export function getBanTimeRemaining(bans: UserBan[], banType: BanType): number | undefined {
  const activeBan = getActiveBan(bans, banType)
  if (!activeBan?.end_time) return undefined

  const remaining = new Date(activeBan.end_time).getTime() - Date.now()
  return remaining > 0 ? remaining : 0
}

// Get all active ban types for a user
export function getActiveBans(bans: UserBan[]): BanType[] {
  const activeBanTypes = new Set<BanType>()
  for (const ban of bans) {
    if (isBanActive(ban)) {
      activeBanTypes.add(ban.ban_type)
    }
  }
  return Array.from(activeBanTypes)
}

// Get all active ban records
export function getActiveBanRecords(bans: UserBan[]): UserBan[] {
  return bans.filter(isBanActive)
}

// Mapping: which ban types block which actions
export function getBanTypesForAction(action: string): BanType[] {
  const actionMap: Record<string, BanType[]> = {
    'comment': ['posting'],
    'createMarket': ['marketControl'],
    'updateMarket': ['marketControl'],
    'resolveMarket': ['marketControl'],
    'editAnswer': ['marketControl'],
    // Adding answers affects liquidity (trading), market structure (marketControl), and content (posting)
    'createAnswer': ['posting', 'marketControl', 'trading'],
    'hideComment': ['marketControl'],
    'trade': ['trading'],
    'bet': ['trading'],
    'managram': ['posting', 'trading'],  // Blocked by either
    'removeLiquidity': ['trading'],
    'addLiquidity': ['trading'],
    'boost': ['trading'],
    'message': ['posting'],
    'post': ['posting'],
    'editComment': ['posting'],
    'review': ['posting'],
    'addTopic': ['marketControl'],
    // Poll voting affects market outcome (trading), market structure (marketControl), and is a form of participation (posting)
    'pollVote': ['posting', 'marketControl', 'trading'],
    // Purchasing mana
    'purchase': ['purchase'],
  }
  return actionMap[action] || []
}

export function formatBanTimeRemaining(ms: number): string {
  const DAY_MS = 24 * 60 * 60 * 1000
  const HOUR_MS = 60 * 60 * 1000
  const MINUTE_MS = 60 * 1000

  const days = Math.floor(ms / DAY_MS)
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS)
  const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS)

  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''}${hours > 0 ? ` ${hours} hour${hours > 1 ? 's' : ''}` : ''}`
  }
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''}${minutes > 0 ? ` ${minutes} min` : ''}`
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''}`
  }
  return 'less than 1 minute'
}

export function getBanTypeDisplayName(banType: BanType): string {
  const names: Record<BanType, string> = {
    posting: 'Posting',
    marketControl: 'Market Control',
    trading: 'Trading',
    purchase: 'Purchase',
    modAlert: 'Mod Alert',
  }
  return names[banType]
}

export function getBanTypeDescription(banType: BanType): string {
  const descriptions: Record<BanType, string> = {
    posting: 'commenting, messaging, creating posts, adding answers, poll voting',
    marketControl: 'creating, editing, resolving markets, hiding comments, adding/editing answers, poll voting',
    trading: 'betting, managrams, liquidity changes, adding answers, poll voting',
    purchase: 'buying mana',
    modAlert: 'warning message from moderators (no actions blocked)',
  }
  return descriptions[banType]
}

// Get active bans that actually block actions (excludes modAlert)
export function getActiveBlockingBans(bans: UserBan[]): BanType[] {
  return getActiveBans(bans).filter(t => t !== 'modAlert')
}

// Get all active mod alerts (can be multiple - they stack)
export function getActiveModAlerts(bans: UserBan[]): UserBan[] {
  return bans.filter(ban => ban.ban_type === 'modAlert' && isBanActive(ban))
}
