import { Row, run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
export type Question = Row<'love_questions'>
export type Answer = Row<'love_answers'>
export const getAllQuestions = async () => {
  const res = await run(
    db
      .from('love_questions')
      .select('*')
      .order('importance_score', { ascending: false })
  )
  return res.data
}

export const getUserAnswersAndQuestions = async (userId: string) => {
  const answers = await run(
    db.from('love_answers').select('*').eq('creator_id', userId)
  )
  const questionIds = answers.data.map((row) => row.question_id)
  const questions = await run(
    db.from('love_questions').select('*').in('id', questionIds)
  )
  return { answers: answers.data, questions: questions.data }
}
