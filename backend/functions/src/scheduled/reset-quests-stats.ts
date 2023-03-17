// check every day if the user has created a bet since 4pm UTC, and if not, reset their streak

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { User } from 'common/user'
const firestore = admin.firestore()

export const resetQuestStats = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  // 12am midnight on Monday Pacific time
  .pubsub.schedule(`0 0 * * 1`)
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    await resetQuestStatsInternal()
  })

const resetQuestStatsInternal = async () => {
  const usersSnap = await firestore.collection('users').get()

  await Promise.all(
    usersSnap.docs.map((doc) => {
      firestore
        .collection('users')
        .doc(doc.id)
        .update({
          sharesThisWeek: 0,
          marketsCreatedThisWeek: 0,
        } as User)
    })
  )
}
