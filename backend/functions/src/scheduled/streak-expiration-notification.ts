import * as functions from 'firebase-functions'

import { secrets } from 'common/secrets'
import { BETTING_STREAK_RESET_HOUR } from 'common/economy'
import { currentDateBettingStreakResetTime, log } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { createBettingStreakExpiringNotification } from 'shared/create-notification'

export const streakExpirationNotifications = functions
  .runWith({
    memory: '256MB',
    timeoutSeconds: 540,
    secrets,
  })
  .pubsub.schedule(`0 ${BETTING_STREAK_RESET_HOUR - 3} * * *`)
  .timeZone('Etc/UTC')
  .onRun(async () => {
    await streakExpirationNotificationsInternal()
  })

export const streakExpirationNotificationsInternal = async () => {
  const mostRecentResetTime = currentDateBettingStreakResetTime()
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
  console.log('expiringStreakBettors', expiringStreakBettors.length)
  await Promise.all(
    expiringStreakBettors.map(async (user) => {
      await createBettingStreakExpiringNotification(user.id, user.streak, pg)
    })
  )
}
