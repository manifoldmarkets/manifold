import { Row, run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
export type Question = Row<'love_questions'>
export type Answer = Row<'love_answers'>
export const getAllQuestions = async () => {
  const res = await run(
    db.from('love_questions').select('*').order('created_time')
  )
  return res.data
}

export const getFreeResponseQuestions = async () => {
  const res = await run(
    db
      .from('love_questions')
      .select('*')
      .order('created_time')
      .eq('answer_type', 'free_response')
  )
  return res.data
}

export const getUserAnswers = async (userId: string) => {
  const { data } = await run(
    db.from('love_answers').select('*').eq('creator_id', userId)
  )
  return data
}

export const getQuestionsWithAnswerCount = async () => {
  const { data } = await db.rpc(
    'get_free_response_questions_with_answer_count' as any
  )
  return data
}
