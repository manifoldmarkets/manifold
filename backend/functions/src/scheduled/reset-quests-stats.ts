// check every day if the user has created a bet since 4pm UTC, and if not, reset their streak

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { setScoreValueOnUsers } from 'common/supabase/set-scores'
import { QUEST_SCORE_IDS, QUEST_SET_ID } from 'common/quest'
import { createSupabaseClient } from 'shared/supabase/init'
import { chunk } from 'lodash'
const firestore = admin.firestore()
const DAILY_QUEST_SCORE_IDS = ['currentBettingStreak', 'sharesToday']
export const resetWeeklyQuestStats = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  // 12am midnight on Monday Pacific time
  .pubsub.schedule(`0 0 * * 0`)
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    try {
      await resetWeeklyQuestStatsInternal()
    } catch (e) {
      console.error(e)
    }
  })
export const resetDailyQuestStats = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  // 12am midnight on Monday Pacific time
  .pubsub.schedule(`0 0 * * *`)
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    try {
      await resetDailyQuestStatsInternal()
    } catch (e) {
      console.error(e)
    }
  })

export const resetWeeklyQuestStatsInternal = async () => {
  const usersSnap = await firestore.collection('users').get()
  console.log(`Resetting quest stats for ${usersSnap.docs.length} users`)
  const userIds = usersSnap.docs.map((d) => d.id)
  const db = createSupabaseClient()
  // TODO: test on prod
  const chunks = chunk(userIds, 1000)
  await Promise.all(
    chunks.map(async (chunk) => {
      await setScoreValueOnUsers(
        chunk,
        QUEST_SET_ID,
        QUEST_SCORE_IDS.filter((id) => !DAILY_QUEST_SCORE_IDS.includes(id)),
        0,
        db
      )
    })
  )
}
export const resetDailyQuestStatsInternal = async () => {
  const usersSnap = await firestore.collection('users').get()
  console.log(`Resetting quest stats for ${usersSnap.docs.length} users`)
  const userIds = usersSnap.docs.map((d) => d.id)
  const db = createSupabaseClient()
  // TODO: test on prod
  const chunks = chunk(userIds, 1000)
  await Promise.all(
    chunks.map(async (chunk) => {
      await setScoreValueOnUsers(
        chunk,
        QUEST_SET_ID,
        // resetBettingStreaksForUsers handles the betting streak quest
        ['sharesToday'],
        0,
        db
      )
    })
  )
}
