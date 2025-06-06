import { QUEST_SCORE_IDS } from 'common/quest'
import { createSupabaseDirectClient } from 'shared/supabase/init'
const DAILY_QUEST_SCORE_IDS = ['currentBettingStreak', 'sharesToday']

export const resetWeeklyQuestStatsInternal = async () => {
  const pg = createSupabaseDirectClient()
  const scoreIds = QUEST_SCORE_IDS.filter(
    (id) => !DAILY_QUEST_SCORE_IDS.includes(id)
  )
  const query = `
    UPDATE user_quest_metrics
    SET score_value = 0
    WHERE score_value > 0
    AND score_id = ANY($1)
  `
  await pg.none(query, [scoreIds])
  console.log(`Reset weekly quest stats for score IDs: ${scoreIds.join(', ')}`)
}

export const resetDailyQuestStatsInternal = async () => {
  const pg = createSupabaseDirectClient()
  const query = `
    UPDATE user_quest_metrics
    SET score_value = 0
    WHERE score_value > 0
    AND score_id = 'sharesToday'
  `
  await pg.none(query)
  console.log(`Reset daily quest stats for score ID: sharesToday`)
}
