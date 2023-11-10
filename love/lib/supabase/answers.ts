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
