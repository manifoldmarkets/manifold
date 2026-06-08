import { BOT_USERNAMES, ENV_CONFIG, MOD_IDS } from 'common/envs/constants'
import { UserEntitlement } from 'common/shop/types'
import { User } from 'common/user'

export type DisplayUser = {
  id: string
  name: string
  username: string
  avatarUrl: string
  isBot?: boolean
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
 *
 * Strips verificationFlagReason — it's an admin-only audit note (e.g.
 * "suspected alt of @x") that must never reach the public User surface. The
 * user/:username and user/by-id/:id endpoints are unauthenticated, so it's
 * stripped here centrally for every FullUser consumer. Admins read it via the
 * admin-gated get-user-info endpoint instead.
 */
export function toUserAPIResponse(user: User): FullUser {
  const { verificationFlagReason: _adminOnly, ...rest } = user
  return {
    ...rest,
    url: `https://${ENV_CONFIG.domain}/${user.username}`,
    isBot: user.isBot ?? BOT_USERNAMES.includes(user.username),
    isAdmin: ENV_CONFIG.adminIds.includes(user.id),
    isTrustworthy: MOD_IDS.includes(user.id),
  }
}
