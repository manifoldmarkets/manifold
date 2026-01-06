import { APIError, type APIHandler } from 'api/helpers/endpoint'
import { isAdminId } from 'common/envs/constants'
import { UnbanRecord } from 'common/user'
import { trackPublicEvent } from 'shared/analytics'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { FieldVal } from 'shared/supabase/utils'
import { updateUser } from 'shared/supabase/users'
import { getUser, log } from 'shared/utils'

export const banuser: APIHandler<'ban-user'> = async (props, auth) => {
  const { userId, unban, unbanTime, bans, unbanTimes, reason, modAlert, unbanNote, allowUsernameChange } = props
  const db = createSupabaseDirectClient()
  throwErrorIfNotMod(auth.uid)
  if (isAdminId(userId)) throw new APIError(403, 'Cannot ban admin')

  const user = await getUser(userId)
  if (!user) throw new APIError(404, 'User not found')

  const now = Date.now()

  // Handle legacy unban (clears all bans)
  if (unban) {
    await updateUser(db, userId, {
      isBannedFromPosting: false,
      bans: undefined,
      modAlert: undefined,
    })
    await db.none(`update users set unban_time = null where id = $1`, [userId])
    await trackPublicEvent(auth.uid, 'unban user', { userId })
    log('unbanned user', userId)
    return { success: true }
  }

  // Handle legacy ban (for backward compatibility)
  if (unbanTime !== undefined && !bans) {
    await updateUser(db, userId, {
      isBannedFromPosting: true,
    })
    if (unbanTime) {
      await db.none(`update users set unban_time = $1 where id = $2`, [
        new Date(unbanTime).toISOString(),
        userId,
      ])
    }
    await trackPublicEvent(auth.uid, 'ban user', { userId, legacy: true })
    log('banned user (legacy)', userId)
    return { success: true }
  }

  // Handle new granular bans
  if (bans) {
    const updatedBans = { ...(user.bans || {}) }
    const newHistoryRecords: UnbanRecord[] = []

    for (const [banType, shouldBan] of Object.entries(bans)) {
      const typedBanType = banType as 'posting' | 'marketControl' | 'trading'
      if (shouldBan) {
        // Ban user from this type
        updatedBans[typedBanType] = {
          bannedAt: now,
          bannedBy: auth.uid,
          reason: reason || 'No reason provided',
          unbanTime: unbanTimes?.[typedBanType],
        }
      } else {
        // Unban from this specific type - record history first
        const existingBan = user.bans?.[typedBanType]
        if (existingBan) {
          newHistoryRecords.push({
            banType: typedBanType,
            bannedAt: existingBan.bannedAt,
            bannedBy: existingBan.bannedBy,
            banReason: existingBan.reason,
            wasTemporary: !!existingBan.unbanTime,
            originalUnbanTime: existingBan.unbanTime,
            unbannedAt: now,
            unbannedBy: auth.uid,
            unbanNote: unbanNote,
          })
        }
        delete updatedBans[typedBanType]
      }
    }

    const bannedTypes = Object.keys(bans).filter((k) => bans[k as keyof typeof bans])
    const hasBansRemaining = Object.keys(updatedBans).length > 0

    // Handle username change restriction
    // Default: any new ban restricts username changes (unless mod opts out with allowUsernameChange=true)
    // If allowUsernameChange is explicitly set, use that value
    let usernameChangeUpdate: { canChangeUsername?: boolean } = {}
    if (bannedTypes.length > 0) {
      // New bans being applied
      if (allowUsernameChange === true) {
        // Mod explicitly opted out of restricting username changes - leave as is
      } else if (allowUsernameChange === false || allowUsernameChange === undefined) {
        // Default behavior or explicit restriction: disable username changes
        if (user.canChangeUsername !== false) {
          usernameChangeUpdate.canChangeUsername = false
          log('restricting username changes for user', userId)
        }
      }
    }

    // Handle explicit username change permission toggle (can be done without adding bans)
    if (allowUsernameChange === true && user.canChangeUsername === false) {
      // Re-enabling username changes - record in history
      newHistoryRecords.push({
        banType: 'usernameChange',
        bannedAt: now, // We don't have the original time, use now as placeholder
        bannedBy: 'unknown',
        banReason: 'Username changes were restricted',
        wasTemporary: false,
        unbannedAt: now,
        unbannedBy: auth.uid,
        unbanNote: unbanNote || 'Mod re-enabled username changes',
      })
      usernameChangeUpdate.canChangeUsername = undefined // Remove restriction (delete field)
      log('re-enabling username changes for user', userId)
    }

    // Check if user is now permanently banned from all three types
    // If so, also set the legacy isBannedFromPosting flag for backward compatibility
    // (leaderboards, SQL queries, etc. that still check the legacy field)
    const allBanTypes: ('posting' | 'marketControl' | 'trading')[] = [
      'posting',
      'marketControl',
      'trading',
    ]
    const isPermanentlyBannedFromAll = allBanTypes.every((banType) => {
      const ban = updatedBans[banType]
      return ban && !ban.unbanTime // Has ban and no unban time = permanent
    })

    // Determine legacy flag update:
    // - Set to true if permanently banned from all 3 types (sync legacy flag)
    // - Set to false only if ALL bans are being removed (full unban)
    // - Otherwise, don't change it (preserve existing legacy state)
    let legacyBanUpdate: { isBannedFromPosting?: boolean } = {}
    if (isPermanentlyBannedFromAll) {
      legacyBanUpdate.isBannedFromPosting = true
    } else if (!hasBansRemaining) {
      // Only clear legacy flag when fully unbanned
      legacyBanUpdate.isBannedFromPosting = false
    }
    // Note: if partial bans remain but not all 3, we preserve the existing legacy flag

    if (hasBansRemaining) {
      // Update bans and optionally add history
      const update: any = {
        bans: updatedBans,
        ...usernameChangeUpdate,
        ...legacyBanUpdate,
      }
      if (newHistoryRecords.length > 0) {
        update.banHistory = [...(user.banHistory || []), ...newHistoryRecords]
      }
      await updateUser(db, userId, update)
    } else {
      // No bans remaining - need to delete the bans field entirely
      const update: any = {
        bans: FieldVal.delete(),
        ...usernameChangeUpdate,
        ...legacyBanUpdate,
      }
      if (newHistoryRecords.length > 0) {
        update.banHistory = [...(user.banHistory || []), ...newHistoryRecords]
      }
      await updateUser(db, userId, update)
    }

    const unbannedTypes = Object.keys(bans).filter((k) => !bans[k as keyof typeof bans])

    if (bannedTypes.length > 0) {
      await trackPublicEvent(auth.uid, 'ban user', { userId, bans: bannedTypes })
    }
    if (unbannedTypes.length > 0) {
      await trackPublicEvent(auth.uid, 'unban user', { userId, bans: unbannedTypes })
    }
    log('updated user bans', userId, { added: bannedTypes, removed: unbannedTypes })
  }

  // Handle standalone username change permission toggle (without any ban changes)
  if (!bans && allowUsernameChange !== undefined) {
    const newHistoryRecords: UnbanRecord[] = []

    if (allowUsernameChange === true && user.canChangeUsername === false) {
      // Re-enabling username changes
      newHistoryRecords.push({
        banType: 'usernameChange',
        bannedAt: now,
        bannedBy: 'unknown',
        banReason: 'Username changes were restricted',
        wasTemporary: false,
        unbannedAt: now,
        unbannedBy: auth.uid,
        unbanNote: unbanNote || 'Mod re-enabled username changes',
      })
      const update: any = { canChangeUsername: FieldVal.delete() }
      if (newHistoryRecords.length > 0) {
        update.banHistory = [...(user.banHistory || []), ...newHistoryRecords]
      }
      await updateUser(db, userId, update as any)
      log('re-enabling username changes for user (standalone)', userId)
    } else if (allowUsernameChange === false && user.canChangeUsername !== false) {
      // Restricting username changes without a ban
      await updateUser(db, userId, { canChangeUsername: false })
      log('restricting username changes for user (standalone)', userId)
    }
  }

  // Set mod alert (can exist without bans)
  if (modAlert) {
    await updateUser(db, userId, {
      modAlert: {
        message: modAlert.message,
        createdAt: now,
        createdBy: auth.uid,
        dismissed: false,
      },
    })
    await trackPublicEvent(auth.uid, 'send mod alert', { userId })
    log('sent mod alert to user', userId)
  }

  return { success: true }
}
