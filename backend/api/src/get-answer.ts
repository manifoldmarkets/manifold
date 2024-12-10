import { APIError } from 'common/api/utils'
import { APIHandler } from './helpers/endpoint'
import { getAnswer } from 'shared/supabase/answers'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getSingleAnswer: APIHandler<'answer/:answerId'> = async (
  props
) => {
  const pg = createSupabaseDirectClient()
  const answer = await getAnswer(pg, props.answerId)
  if (!answer) {
    throw new APIError(404, 'Answer not found')
  }
  return answer
}
