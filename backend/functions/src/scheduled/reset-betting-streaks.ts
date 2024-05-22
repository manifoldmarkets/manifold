// check every day if the user has created a bet since 4pm UTC, and if not, reset their streak

import * as functions from 'firebase-functions'
import { User } from 'common/user'
import { DAY_MS } from 'common/util/time'
import { BETTING_STREAK_RESET_HOUR } from 'common/economy'
import { updateUser } from 'shared/supabase/users'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { convertUser } from 'common/supabase/users'

export const resetBettingStreaksForUsers = functions
  .runWith({ timeoutSeconds: 540, memory: '4GB' })
  .pubsub.schedule(`0 ${BETTING_STREAK_RESET_HOUR} * * *`)
  .timeZone('Etc/UTC')
  .onRun(async () => {
    await resetBettingStreaksInternal()
  })

const resetBettingStreaksInternal = async () => {
  const pg = createSupabaseDirectClient()

  const users = await pg.map(
    `select * from users
    where (data->'currentBettingStreak')::numeric > 0`,
    [],
    convertUser
  )

  const betStreakResetTime = Date.now() - DAY_MS
  await Promise.all(
    users.map((user) => resetBettingStreakForUser(pg, user, betStreakResetTime))
  )
}

const resetBettingStreakForUser = async (
  db: SupabaseDirectClient,
  user: User,
  betStreakResetTime: number
) => {
  // if they made a bet within the last day, don't reset their streak
  if (
    (user?.lastBetTime ?? 0) > betStreakResetTime ||
    !user.currentBettingStreak ||
    user.currentBettingStreak === 0
  )
    return

  if (user.streakForgiveness > 0) {
    await updateUser(db, user.id, {
      streakForgiveness: user.streakForgiveness - 1,
    })
    // Should we send a notification to the user?
  } else {
    await updateUser(db, user.id, {
      currentBettingStreak: 0,
    })
  }
}
