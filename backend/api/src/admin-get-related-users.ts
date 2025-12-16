import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { convertUser } from 'common/supabase/users'
import { toUserAPIResponse } from 'common/api/user-types'
import { getPrivateUser } from 'shared/utils'

export const adminGetRelatedUsers: APIHandler<'admin-get-related-users'> =
  async (props, auth) => {
    const { userId } = props

    throwErrorIfNotAdmin(auth.uid)

    const pg = createSupabaseDirectClient()

    // Get target user's createdTime
    const targetUser = await pg.oneOrNone(
      `select created_time from users where id = $1`,
      [userId]
    )

    const privateUser = await getPrivateUser(userId)
    if (!privateUser) {
      return { userId, targetCreatedTime: targetUser?.created_time, matches: [] }
    }

    const { initialDeviceToken, initialIpAddress } = privateUser

    if (!initialDeviceToken && !initialIpAddress) {
      return { userId, targetCreatedTime: targetUser?.created_time, matches: [] }
    }

    // Find users with matching IP or device token
    const matchingUsers = await pg.manyOrNone(
      `
      select
        pu.id,
        pu.data->>'initialDeviceToken' as device_token,
        pu.data->>'initialIpAddress' as ip_address
      from private_users pu
      where pu.id != $1
        and (
          ($2::text is not null and pu.data->>'initialDeviceToken' = $2)
          or ($3::text is not null and pu.data->>'initialIpAddress' = $3)
        )
      `,
      [userId, initialDeviceToken, initialIpAddress]
    )

    if (!matchingUsers || matchingUsers.length === 0) {
      return { userId, targetCreatedTime: targetUser?.created_time, matches: [] }
    }

    // Get full user data for matches
    const matchingUserIds = matchingUsers.map((u) => u.id)
    const users = await pg.map(
      `select * from users where id = any($1)`,
      [matchingUserIds],
      convertUser
    )

    // Build match results with reasons
    const matches = users.map((user) => {
      const privateMatch = matchingUsers.find((m) => m.id === user.id)
      const matchReasons: ('ip' | 'deviceToken')[] = []

      if (
        initialIpAddress &&
        privateMatch?.ip_address === initialIpAddress
      ) {
        matchReasons.push('ip')
      }
      if (
        initialDeviceToken &&
        privateMatch?.device_token === initialDeviceToken
      ) {
        matchReasons.push('deviceToken')
      }

      return {
        visibleUser: toUserAPIResponse(user),
        matchReasons,
      }
    })

    return {
      userId,
      targetCreatedTime: targetUser?.created_time,
      matches,
    }
  }
