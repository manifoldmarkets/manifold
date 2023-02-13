// check every day if the user has created a bet since 4pm UTC, and if not, reset their streak

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { User } from 'common/user'
import { DAY_MS } from 'common/util/time'
import { BETTING_STREAK_RESET_HOUR } from 'common/economy'
const firestore = admin.firestore()

export const resetBettingStreaksForUsers = functions
  .runWith({ timeoutSeconds: 540, memory: '4GB' })
  .pubsub.schedule(`0 ${BETTING_STREAK_RESET_HOUR} * * *`)
  .timeZone('Etc/UTC')
  .onRun(async () => {
    await resetBettingStreaksInternal()
  })

const resetBettingStreaksInternal = async () => {
  const usersSnap = await firestore
    .collection('users')
    .where('currentBettingStreak', '>', 0)
    .get()

  const users = usersSnap.docs.map((doc) => doc.data() as User)
  const betStreakResetTime = Date.now() - DAY_MS
  await Promise.all(
    users.map((user) => resetBettingStreakForUser(user, betStreakResetTime))
  )
}

const resetBettingStreakForUser = async (
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
    await firestore
      .collection('users')
      .doc(user.id)
      .update({
        streakForgiveness: user.streakForgiveness - 1,
      })
    // Should we send a notification to the user?
  } else {
    await firestore.collection('users').doc(user.id).update({
      currentBettingStreak: 0,
    })
  }
}
