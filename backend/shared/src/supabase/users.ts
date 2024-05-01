import { SupabaseDirectClient } from 'shared/supabase/init'
import { SupabaseClient } from 'common/supabase/utils'
import { WEEK_MS } from 'common/util/time'
import { APIError } from 'common/api/utils'

// used for API to allow username as parm
export const getUserIdFromUsername = async (
  db: SupabaseClient,
  username?: string
) => {
  if (!username) return undefined

  const { data, error } = await db
    .from('users')
    .select('id')
    .eq('username', username)
    .single()
  if (error) throw new APIError(404, `User with username ${username} not found`)

  return data.id
}

export const getUserFollowerIds = async (
  userId: string,
  pg: SupabaseDirectClient
) => {
  const userFollowerIds = await pg.manyOrNone<{ user_id: string }>(
    `select user_id from user_follows where follow_id = $1`,
    [userId]
  )
  return userFollowerIds.map((r) => r.user_id)
}

export const getWhenToIgnoreUsersTime = () => {
  // Always get the same time a month ago today so postgres can cache the query
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  return today.getTime() - 2 * WEEK_MS
}

export const getMostlyActiveUserIds = async (
  pg: SupabaseDirectClient,
  randomNumberThreshold?: number,
  userIds?: string[]
) => {
  const longAgo = getWhenToIgnoreUsersTime()
  return await pg.map(
    `select id
            from users
            join (
             select ucv.user_id, max(
               greatest(ucv.last_page_view_ts, ucv.last_promoted_view_ts, ucv.last_card_view_ts)
             ) as max_created_time
             from user_contract_views ucv
             group by ucv.user_id
         ) as ucv on id = ucv.user_id
     where (
         ((data->'lastBetTime')::bigint is not null and (data->'lastBetTime')::bigint >= $1) or
         ((data->'lastBetTime')::bigint is null and users.created_time >= $2) or
         (ucv.max_created_time >= $2) or
         ($3 is null or (random() <=  $3))
         )
        and ($4 is null or id = any($4))
       `,
    [longAgo, new Date(longAgo).toISOString(), randomNumberThreshold, userIds],
    (r: { id: string }) => r.id
  )
}
