import { BOT_USERNAMES, ENV_CONFIG, MOD_IDS } from 'common/envs/constants'
import { User } from 'common/user'
import { removeUndefinedProps } from 'common/util/object'

export type DisplayUser = {
  id: string
  name: string
  username: string
  avatarUrl: string
  isBannedFromPosting?: boolean
}

// Type for individual ban entries in the legacy bans field
type LegacyBanDetails = {
  bannedAt: number
  bannedBy: string
  reason: string
  unbanTime?: number
}

// Ban details with mod identity removed (for public display)
export type PublicBanDetails = Omit<LegacyBanDetails, 'bannedBy'>

export type FullUser = User & {
  url: string
  isBot?: boolean
  isAdmin?: boolean
  isTrustworthy?: boolean
}

/**
 * Sanitize ban-related fields based on visibility level.
 *
 * Visibility levels:
 * - 'public': Other users viewing this profile
 *   - Removes bannedBy from bans
 *   - Removes modAlert entirely
 *   - Removes banHistory entirely
 *
 * - 'self': User viewing their own profile via /me
 *   - Removes bannedBy from bans (protects mod identity)
 *   - KEEPS modAlert (user needs to see warnings)
 *   - Removes createdBy from modAlert (protects mod identity)
 *   - Removes banHistory (internal audit)
 *
 * - 'admin': Mods/admins viewing via admin endpoints
 *   - Returns everything unsanitized
 */
function sanitizeBanFields(
  user: User,
  visibility: 'public' | 'self' | 'admin'
): Partial<User> {
  if (visibility === 'admin') {
    return {} // No sanitization needed
  }

  const sanitized: Partial<User> = {}

  // Sanitize bans - remove bannedBy from each ban type
  if (user.bans) {
    const sanitizedBans: User['bans'] = {}
    for (const [banType, banDetails] of Object.entries(user.bans)) {
      if (banDetails) {
        const { bannedBy, ...publicBanDetails } = banDetails
        sanitizedBans[banType as keyof typeof user.bans] =
          publicBanDetails as LegacyBanDetails
      }
    }
    sanitized.bans = sanitizedBans
  }

  // Handle modAlert based on visibility
  if (visibility === 'public') {
    // Public: remove modAlert entirely
    sanitized.modAlert = undefined
  } else if (visibility === 'self' && user.modAlert) {
    // Self: keep modAlert but remove createdBy (mod identity)
    const { createdBy, ...publicModAlert } = user.modAlert
    sanitized.modAlert = publicModAlert as User['modAlert']
  }

  // Always remove banHistory (internal audit trail with mod IDs)
  sanitized.banHistory = undefined

  return sanitized
}

/**
 * Convert user to API response format.
 *
 * @param user - The user object from the database
 * @param options.visibility - Controls what ban data is exposed:
 *   - 'public' (default): For viewing other users' profiles
 *   - 'self': For /me endpoint (user sees their own modAlert)
 *   - 'admin': For admin endpoints (full unsanitized data)
 */
export function toUserAPIResponse(
  user: User,
  options?: { visibility?: 'public' | 'self' | 'admin' }
): FullUser {
  const { visibility = 'public' } = options ?? {}

  const baseResponse = {
    ...user,
    url: `https://${ENV_CONFIG.domain}/${user.username}`,
    isBot: BOT_USERNAMES.includes(user.username),
    isAdmin: ENV_CONFIG.adminIds.includes(user.id),
    isTrustworthy: MOD_IDS.includes(user.id),
  }

  // Apply sanitization based on visibility level
  const sanitizedBanFields = sanitizeBanFields(user, visibility)
  return removeUndefinedProps({
    ...baseResponse,
    ...sanitizedBanFields,
  })
}
