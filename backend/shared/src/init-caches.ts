import { buildUserInterestsCache } from 'shared/topic-interests'
import { createSupabaseDirectClient } from 'shared/supabase/init'
export const DEBUG_TOPIC_INTERESTS = process.platform === 'darwin'

export const initCaches = async () => {
  if (DEBUG_TOPIC_INTERESTS) return
  const pg = createSupabaseDirectClient()
  const activeUserIdsToCacheInterests = await pg.map(
    `select distinct user_id from user_contract_interactions
              where created_time > now() - interval $1`,
    ['3 months'],
    (r) => r.user_id as string
  )
  await buildUserInterestsCache(activeUserIdsToCacheInterests)
}
