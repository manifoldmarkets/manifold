import {
  buildUserInterestsCache,
  clearUserInterestsCache,
} from 'shared/topic-interests'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { scheduleDailyAtUtcHour } from 'shared/helpers/daily-schedule'
import { log } from 'shared/utils'
export const DEBUG_TOPIC_INTERESTS = process.platform === 'darwin'

// 08:00 UTC is midnight/1 AM LA: clear of the scheduler's 2:00-5:30 AM LA
// maintenance pile, which already pins db disk throughput at its cap around
// 09:30-11:30 UTC each morning (this stack-up caused the June 2026 outages).
const CACHE_REFRESH_HOUR_UTC = 8

const getRecentlyActiveUserIds = (pg: SupabaseDirectClient) =>
  pg.map(
    `select distinct user_id from user_contract_interactions
              where created_time > now() - interval $1`,
    ['1 hour'],
    (r) => r.user_id as string
  )

export const initCaches = async (timeoutId: NodeJS.Timeout) => {
  if (DEBUG_TOPIC_INTERESTS) {
    clearTimeout(timeoutId)
    return
  }
  const pg = createSupabaseDirectClient()
  log('Connected to the db')
  const activeUserIdsToCacheInterests = await getRecentlyActiveUserIds(pg)
  clearTimeout(timeoutId)
  log(
    'Active user ids to cache interests: ',
    activeUserIdsToCacheInterests.length
  )
  buildUserInterestsCache(activeUserIdsToCacheInterests)
}

// Once cached, a user's topic-interest scores are never recomputed and the map
// never evicts, so rebuild it daily: fresh scores, and memory bounded to about
// a day's active users. This used to be PM2's cron_restart, which got the same
// effect by killing the API process and took the API down every morning.
export const scheduleDailyCacheRefresh = () => {
  if (DEBUG_TOPIC_INTERESTS) return
  scheduleDailyAtUtcHour(
    CACHE_REFRESH_HOUR_UTC,
    'User interests cache refresh',
    async () => {
      const cleared = clearUserInterestsCache()
      const activeUserIds = await getRecentlyActiveUserIds(
        createSupabaseDirectClient()
      )
      log('Refreshing user interests cache', {
        cleared,
        activeUsers: activeUserIds.length,
      })
      await buildUserInterestsCache(activeUserIds)
    }
  )
}
