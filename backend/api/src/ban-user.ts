import { APIError, type APIHandler } from 'api/helpers/endpoint'
import { isAdminId } from 'common/envs/constants'
import { BanType, UserBan } from 'common/user'
import { trackPublicEvent } from 'shared/analytics'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'
import { FieldVal } from 'shared/supabase/utils'
import { getUser, log } from 'shared/utils'

// Get active bans for a user (not ended)
async function getActiveUserBans(pg: ReturnType<typeof createSupabaseDirectClient>, userId: string): Promise<UserBan[]> {
  return pg.manyOrNone<UserBan>(
    `SELECT * FROM user_bans
     WHERE user_id = $1
       AND ended_at IS NULL
       AND (end_time IS NULL OR end_time > now())
     ORDER BY created_at DESC`,
    [userId]
  )
}

// Create a new ban
async function createBan(
  pg: ReturnType<typeof createSupabaseDirectClient>,
  userId: string,
  banType: BanType,
  reason: string,
  createdBy: string,
  endTime?: Date
): Promise<UserBan> {
  return pg.one<UserBan>(
    `INSERT INTO user_bans (user_id, ban_type, reason, created_by, end_time)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, banType, reason, createdBy, endTime?.toISOString() ?? null]
  )
}

// End all active bans for a user (excludes mod alerts)
async function endAllBans(
  pg: ReturnType<typeof createSupabaseDirectClient>,
  userId: string,
  endedBy: string
): Promise<number> {
  const result = await pg.result(
    `UPDATE user_bans
     SET ended_by = $1, ended_at = now()
     WHERE user_id = $2
       AND ended_at IS NULL
       AND ban_type != 'modAlert'`,
    [endedBy, userId]
  )
  return result.rowCount
}

// End active bans of a specific type for a user
async function endBansByType(
  pg: ReturnType<typeof createSupabaseDirectClient>,
  userId: string,
  banType: BanType,
  endedBy: string
): Promise<number> {
  const result = await pg.result(
    `UPDATE user_bans
     SET ended_by = $1, ended_at = now()
     WHERE user_id = $2
       AND ban_type = $3
       AND ended_at IS NULL`,
    [endedBy, userId, banType]
  )
  return result.rowCount
}

export const banuser: APIHandler<'ban-user'> = async (props, auth) => {
  const { userId, unban, bans, unbanTimes, reason, modAlert, unbanNote, allowUsernameChange, removeAllBans, clearAlertId } = props
  const pg = createSupabaseDirectClient()
  throwErrorIfNotMod(auth.uid)
  if (isAdminId(userId)) throw new APIError(403, 'Cannot ban admin')

  const user = await getUser(userId)
  if (!user) throw new APIError(404, 'User not found')

  // Handle clearing a specific mod alert by ID
  if (clearAlertId !== undefined) {
    await pg.none(
      `UPDATE user_bans SET ended_by = $1, ended_at = now()
       WHERE id = $2 AND user_id = $3 AND ban_type = 'modAlert' AND ended_at IS NULL`,
      [auth.uid, clearAlertId, userId]
    )
    log('cleared mod alert', userId, { alertId: clearAlertId })
    return { success: true }
  }

  // Handle legacy unban (clears all bans but not mod alerts)
  if (unban) {
    const count = await endAllBans(pg, userId, auth.uid)
    // Clear legacy field
    await updateUser(pg, userId, {
      isBannedFromPosting: false,
    })
    await trackPublicEvent(auth.uid, 'unban user', { userId, bansEnded: count })
    log('unbanned user', userId, { bansEnded: count })
    return { success: true }
  }

  // Handle removing all bans at once
  if (removeAllBans) {
    const count = await endAllBans(pg, userId, auth.uid)
    // Clear legacy field
    await updateUser(pg, userId, {
      isBannedFromPosting: false,
    })
    await trackPublicEvent(auth.uid, 'unban user', { userId, removeAll: true, bansEnded: count })
    log('removed all bans', userId, { bansEnded: count })
    return { success: true }
  }

  // Handle granular bans
  if (bans) {
    const bannedTypes: BanType[] = []
    const unbannedTypes: BanType[] = []

    for (const [banType, shouldBan] of Object.entries(bans)) {
      const typedBanType = banType as BanType

      if (shouldBan) {
        // First, end any existing active bans of this type
        await endBansByType(pg, userId, typedBanType, auth.uid)

        // Create new ban
        const endTime = unbanTimes?.[typedBanType]
          ? new Date(unbanTimes[typedBanType]!)
          : undefined

        await createBan(
          pg,
          userId,
          typedBanType,
          reason || 'No reason provided',
          auth.uid,
          endTime
        )
        bannedTypes.push(typedBanType)
      } else {
        // Unban from this specific type
        const count = await endBansByType(pg, userId, typedBanType, auth.uid)
        if (count > 0) {
          unbannedTypes.push(typedBanType)
        }
      }
    }

    // Handle username change restriction
    if (bannedTypes.length > 0) {
      if (allowUsernameChange !== true && user.canChangeUsername !== false) {
        await updateUser(pg, userId, { canChangeUsername: false })
        log('restricting username changes for user', userId)
      }
    }

    // Update legacy isBannedFromPosting - only true if ALL THREE ban types are permanently applied
    // Otherwise, clear it so the frontend can use the new granular ban system
    const activeBans = await getActiveUserBans(pg, userId)
    const blockingBans = activeBans.filter(b => b.ban_type !== 'modAlert')
    const hasPermanentPosting = blockingBans.some(b => b.ban_type === 'posting' && !b.end_time)
    const hasPermanentMarketControl = blockingBans.some(b => b.ban_type === 'marketControl' && !b.end_time)
    const hasPermanentTrading = blockingBans.some(b => b.ban_type === 'trading' && !b.end_time)

    if (hasPermanentPosting && hasPermanentMarketControl && hasPermanentTrading) {
      await updateUser(pg, userId, { isBannedFromPosting: true })
    } else {
      // Clear legacy field - partial/temporary bans are shown via the new system
      await updateUser(pg, userId, { isBannedFromPosting: false })
    }

    if (bannedTypes.length > 0) {
      await trackPublicEvent(auth.uid, 'ban user', { userId, bans: bannedTypes })
    }
    if (unbannedTypes.length > 0) {
      await trackPublicEvent(auth.uid, 'unban user', { userId, bans: unbannedTypes })
    }
    log('updated user bans', userId, { added: bannedTypes, removed: unbannedTypes })
  }

  // Handle standalone username change permission toggle
  if (!bans && allowUsernameChange !== undefined) {
    if (allowUsernameChange === true && user.canChangeUsername === false) {
      // Use FieldVal.delete() to remove the key from JSONB - setting undefined doesn't work
      await updateUser(pg, userId, { canChangeUsername: FieldVal.delete() } as any)
      log('re-enabling username changes for user', userId)
    } else if (allowUsernameChange === false && user.canChangeUsername !== false) {
      await updateUser(pg, userId, { canChangeUsername: false })
      log('restricting username changes for user', userId)
    }
  }

  // Set mod alert (can exist without bans)
  // Store in user_bans table for audit history
  // Mod alerts stack - new ones don't end old ones
  if (modAlert) {
    // Create new mod alert in user_bans table (stacks with existing alerts)
    await createBan(
      pg,
      userId,
      'modAlert',
      modAlert.message,
      auth.uid,
      undefined // mod alerts don't auto-expire
    )

    await trackPublicEvent(auth.uid, 'send mod alert', { userId })
    log('sent mod alert to user', userId)
  }

  return { success: true }
}
