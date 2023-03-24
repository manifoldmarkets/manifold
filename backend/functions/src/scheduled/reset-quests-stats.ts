// check every day if the user has created a bet since 4pm UTC, and if not, reset their streak

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { setScoreValue } from 'common/supabase/set-scores'
import { QUEST_SCORE_IDS } from 'common/quest'
import { createSupabaseClient } from 'shared/supabase/init'
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
  console.log(`Resetting quest stats for ${usersSnap.docs.length} users`)
  const db = createSupabaseClient()
  await Promise.all(
    usersSnap.docs.map((doc) =>
      // TODO: this will spam the db too much? - should chunk these updates
      QUEST_SCORE_IDS.map(
        async (scoreId) => await setScoreValue(doc.id, 'quests', scoreId, 0, db)
      )
    )
  )
}
