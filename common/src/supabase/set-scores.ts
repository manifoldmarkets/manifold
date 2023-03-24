import { run, SupabaseClient } from 'common/supabase/utils'
import { QUEST_DETAILS, QUEST_SET_ID, QuestType } from 'common/quest'

export async function getSetScore(
  userId: string,
  setId: string,
  scoreIds: string[],
  db: SupabaseClient
) {
  const { data } = await run(
    db
      .from('user_set_scores')
      .select('score_id,score_value, idempotency_key')
      .eq('user_id', userId)
      .eq('set_id', setId)
      .in('score_id', scoreIds)
  )
  const scoreIdsToValue: {
    [key: string]: {
      score: number
      idempotencyKey: string|undefined
    }
  } = {}
  scoreIds.forEach((scoreId) => {
    const score = data?.find((s) => s.score_id === scoreId)
    scoreIdsToValue[scoreId] = {
      score: score?.score_value ?? 0,
      idempotencyKey: score?.idempotency_key,
    }
  })
  return scoreIdsToValue
}

export async function setScoreValue(
  userId: string,
  setId: string,
  scoreId: string,
  scoreValue: number,
  db: SupabaseClient,
  idempotencyKey?: string
) {
  const { data } = await run(
    db.from('user_set_scores').upsert({
      user_id: userId,
      set_id: setId,
      score_id: scoreId,
      score_value: scoreValue,
      idempotency_key: idempotencyKey,
    })
  )
  return data
}

export async function getQuestScores(
  userId: string,
  scoreIds: string[],
  db: SupabaseClient
) {
  return await getSetScore(userId, QUEST_SET_ID, scoreIds, db)
}

export async function getQuestScore(
  userId: string,
  questType: QuestType,
  db: SupabaseClient
) {
  const scoreId = QUEST_DETAILS[questType].scoreId
  const scores = await getQuestScores(userId, [scoreId], db)
  return scores[scoreId]
}
