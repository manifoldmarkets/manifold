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

    // Get target user data including referredByUserId
    const targetUser = await pg.oneOrNone(
      `select created_time, data->>'referredByUserId' as referred_by_user_id from users where id = $1`,
      [userId]
    )

    const privateUser = await getPrivateUser(userId)

    const { initialDeviceToken, initialIpAddress } = privateUser ?? {}

    // Find users with matching IP or device token
    const ipDeviceMatches =
      initialDeviceToken || initialIpAddress
        ? await pg.manyOrNone(
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
            [userId, initialDeviceToken ?? null, initialIpAddress ?? null]
          )
        : []

    // Find referrer (who referred this user)
    const referrerId = targetUser?.referred_by_user_id

    // Find referees (users this user referred)
    const referees = await pg.manyOrNone(
      `select id from users where data->>'referredByUserId' = $1`,
      [userId]
    )
    const refereeIds = referees.map((r) => r.id)

    // Combine all related user IDs
    const ipDeviceUserIds = ipDeviceMatches.map((u) => u.id)
    const allRelatedIds = [
      ...new Set([
        ...ipDeviceUserIds,
        ...(referrerId ? [referrerId] : []),
        ...refereeIds,
      ]),
    ]

    if (allRelatedIds.length === 0) {
      return { userId, targetCreatedTime: targetUser?.created_time, matches: [] }
    }

    // Get full user data for all matches
    const users = await pg.map(
      `select * from users where id = any($1)`,
      [allRelatedIds],
      convertUser
    )

    // Build match results with reasons
    const matches = users.map((user) => {
      const privateMatch = ipDeviceMatches.find((m) => m.id === user.id)
      const matchReasons: ('ip' | 'deviceToken' | 'referrer' | 'referee')[] = []

      if (initialIpAddress && privateMatch?.ip_address === initialIpAddress) {
        matchReasons.push('ip')
      }
      if (
        initialDeviceToken &&
        privateMatch?.device_token === initialDeviceToken
      ) {
        matchReasons.push('deviceToken')
      }
      if (user.id === referrerId) {
        matchReasons.push('referrer')
      }
      if (refereeIds.includes(user.id)) {
        matchReasons.push('referee')
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
