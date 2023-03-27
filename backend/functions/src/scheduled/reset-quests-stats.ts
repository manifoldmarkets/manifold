// check every day if the user has created a bet since 4pm UTC, and if not, reset their streak

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { setScoreValueOnUsers } from 'common/supabase/set-scores'
import { QUEST_SCORE_IDS, QUEST_SET_ID } from 'common/quest'
import { createSupabaseClient } from 'shared/supabase/init'
import { chunk } from 'lodash'
const firestore = admin.firestore()

export const resetQuestStats = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  // 12am midnight on Monday Pacific time
  .pubsub.schedule(`0 0 * * 1`)
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    try {
      await resetQuestStatsInternal()
    } catch (e) {
      console.error(e)
    }
  })

export const resetQuestStatsInternal = async () => {
  const usersSnap = await firestore.collection('users').get()
  console.log(`Resetting quest stats for ${usersSnap.docs.length} users`)
  const userIds = usersSnap.docs.map((d) => d.id)
  const db = createSupabaseClient()
  // TODO: test on prod
  const chunks = chunk(userIds, 1000)
  await Promise.all(
    chunks.map(async (chunk) => {
      await setScoreValueOnUsers(chunk, QUEST_SET_ID, QUEST_SCORE_IDS, 0, db)
    })
  )
}
