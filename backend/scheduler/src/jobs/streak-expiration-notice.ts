import { getBettingStreakResetTimeBeforeNow, log } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { createBettingStreakExpiringNotification } from 'shared/create-notification'

export const sendStreakExpirationNotification = async () => {
  const mostRecentResetTime = getBettingStreakResetTimeBeforeNow()
  log('Most recent streak reset time', mostRecentResetTime)
  const pg = createSupabaseDirectClient()
  const expiringStreakBettors = await pg.manyOrNone(
    `
    select
      id, (data->'currentBettingStreak')::int as streak
    from users
    where
        (data->'lastBetTime')::bigint < $1
      and (data->'currentBettingStreak')::int > 0
      and (data->'streakForgiveness')::int = 0
    `,
    [mostRecentResetTime]
  )
  log('expiringStreakBettors', expiringStreakBettors.length)
  await Promise.all(
    expiringStreakBettors.map(async (user) => {
      await createBettingStreakExpiringNotification(user.id, user.streak, pg)
    })
  )
}
