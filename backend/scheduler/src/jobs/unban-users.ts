import { createSupabaseDirectClient } from 'shared/supabase/init'
import { FieldVal } from 'shared/supabase/utils'
import { updateUser } from 'shared/supabase/users'
import { UnbanRecord, User } from 'common/user'

export async function unbanUsers() {
  const pg = createSupabaseDirectClient()

  // First, handle legacy bans (unban_time native column)
  const legacyUnbannedUsers = await pg.map(
    `update users
     set data = data - 'isBannedFromPosting',
         unban_time = null
     where (data->>'isBannedFromPosting')::boolean = true
       and unban_time is not null
       and unban_time <= now()
     returning id, username`,
    [],
    (r) => ({ id: r.id, username: r.username })
  )

  console.log(`Unbanned ${legacyUnbannedUsers.length} users (legacy)`)

  // Handle new granular bans
  const usersWithBans = await pg.map(
    `select id, data from users
     where data->'bans' is not null`,
    [],
    (r) => ({ id: r.id, data: r.data as User })
  )

  let granularUnbanCount = 0
  const now = Date.now()

  for (const { id, data: user } of usersWithBans) {
    if (!user.bans) continue

    let modified = false
    const updatedBans = { ...user.bans }
    const newHistoryRecords: UnbanRecord[] = []

    // Check each ban type for expiration
    for (const banType of ['posting', 'marketControl', 'trading'] as const) {
      const ban = updatedBans[banType]
      if (ban?.unbanTime && ban.unbanTime <= now) {
        // Record in history before removing
        newHistoryRecords.push({
          banType,
          bannedAt: ban.bannedAt,
          bannedBy: ban.bannedBy,
          banReason: ban.reason,
          wasTemporary: true,
          originalUnbanTime: ban.unbanTime,
          unbannedAt: now,
          unbannedBy: 'system',
          unbanNote: 'Auto-expired temporary ban',
        })
        delete updatedBans[banType]
        modified = true
        console.log(`Auto-unbanned user ${id} from ${banType}`)
      }
    }

    if (modified) {
      const hasBansRemaining = Object.keys(updatedBans).length > 0
      if (hasBansRemaining) {
        await updateUser(pg, id, {
          bans: updatedBans,
          banHistory: [...(user.banHistory || []), ...newHistoryRecords],
        })
      } else {
        await updateUser(pg, id, {
          bans: FieldVal.delete(),
          banHistory: [...(user.banHistory || []), ...newHistoryRecords],
        } as any)
      }
      granularUnbanCount++
    }
  }

  console.log(`Unbanned ${granularUnbanCount} users from granular bans`)
  console.log(
    `Total unbans: ${legacyUnbannedUsers.length + granularUnbanCount}`
  )
}

