import { Row as rowFor, run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'

export const deleteAnswer = async (
  answer: rowFor<'love_answers'>,
  userId?: string
) => {
  if (!userId || answer.creator_id !== userId) return
  await run(
    db
      .from('love_answers')
      .delete()
      .match({ id: answer.id, creator_id: userId })
  )
}

export const getOtherAnswers = async (question_id: number) => {
  const { data } = await db.rpc('get_love_question_answers_and_lovers' as any, {
    p_question_id: question_id,
  })
  return data
}
