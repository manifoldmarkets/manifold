import { BOT_USERNAMES, ENV_CONFIG, MOD_IDS } from 'common/envs/constants'
import { UserEntitlement } from 'common/shop/types'
import { User } from 'common/user'

export type DisplayUser = {
  id: string
  name: string
  username: string
  avatarUrl: string
  isBannedFromPosting?: boolean
  entitlements?: UserEntitlement[]
}

export type FullUser = User & {
  url: string
  isBot?: boolean
  isAdmin?: boolean
  isTrustworthy?: boolean
}

/**
 * Convert user to API response format.
 */
export function toUserAPIResponse(user: User): FullUser {
  return {
    ...user,
    url: `https://${ENV_CONFIG.domain}/${user.username}`,
    isBot: BOT_USERNAMES.includes(user.username),
    isAdmin: ENV_CONFIG.adminIds.includes(user.id),
    isTrustworthy: MOD_IDS.includes(user.id),
  }
}
