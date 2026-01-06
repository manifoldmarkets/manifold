import { User } from './user'

export type BanType = 'posting' | 'marketControl' | 'trading'

export function isUserBanned(user: User, banType: BanType): boolean {
  // Check new granular ban system
  const ban = user.bans?.[banType]
  if (ban) {
    // Check if temp ban has expired
    if (ban.unbanTime && Date.now() > ban.unbanTime) {
      return false  // Temp ban expired
    }
    return true  // Active ban
  }

  // Backward compatibility: check legacy ban for posting
  if (banType === 'posting' && user.isBannedFromPosting) {
    // Check if legacy temp ban expired
    if (user.unbanTime && Date.now() > user.unbanTime) {
      return false
    }
    return true
  }

  return false
}

export function getUserBanMessage(user: User, banType: BanType): string | undefined {
  return user.bans?.[banType]?.reason
}

export function getBanTimeRemaining(user: User, banType: BanType): number | undefined {
  const ban = user.bans?.[banType]
  if (!ban?.unbanTime) return undefined

  const remaining = ban.unbanTime - Date.now()
  return remaining > 0 ? remaining : 0
}

export function getActiveBans(user: User): BanType[] {
  const bans: BanType[] = []
  if (isUserBanned(user, 'posting')) bans.push('posting')
  if (isUserBanned(user, 'marketControl')) bans.push('marketControl')
  if (isUserBanned(user, 'trading')) bans.push('trading')
  return bans
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
    'message': ['posting'],
    'post': ['posting'],
    'editComment': ['posting'],
    'review': ['posting'],
    'addTopic': ['marketControl'],
    'pollVote': ['posting'],
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
  }
  return names[banType]
}

export function getBanTypeDescription(banType: BanType): string {
  const descriptions: Record<BanType, string> = {
    posting: 'commenting, messaging, creating posts, adding answers',
    marketControl: 'creating, editing, resolving markets, hiding comments, adding/editing answers',
    trading: 'betting, managrams, liquidity changes, adding answers',
  }
  return descriptions[banType]
}
