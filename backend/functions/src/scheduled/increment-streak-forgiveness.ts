// check every day if the user has created a bet since 4pm UTC, and if not, reset their streak

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { User } from 'common/user'
const firestore = admin.firestore()

export const incrementStreakForgiveness = functions
  .runWith({ timeoutSeconds: 540, memory: '4GB' })
  // On every 1st day of the month at 12am PST
  .pubsub.schedule(`0 0 1 * *`)
  .onRun(async () => {
    await incrementStreakForgivenessInternal()
  })

const incrementStreakForgivenessInternal = async () => {
  const usersSnap = await firestore.collection('users').get()

  const users = usersSnap.docs.map((doc) => doc.data() as User)
  await Promise.all(
    users.map((user) =>
      firestore
        .collection('users')
        .doc(user.id)
        .update({
          streakForgiveness: Math.min((user.streakForgiveness ?? 0) + 1, 3),
        })
    )
  )
}
