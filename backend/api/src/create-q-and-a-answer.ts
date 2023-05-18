import { z } from 'zod'

import { authEndpoint, validate } from './helpers'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { randomString } from 'common/util/random'

const bodySchema = z.object({
  questionId: z.string(),
  text: z.string(),
}).strict()

export const createQAndAAnswer = authEndpoint(async (req, auth) => {
  const { questionId, text } = validate(bodySchema, req.body)
  const userId = auth.uid

  const pg = createSupabaseDirectClient()

  const answerId = randomString()

  await pg.none(
    `insert into q_and_a_answers (id, q_and_a_id, user_id, text)
    values ($1, $2, $3, $4)`,
    [answerId, questionId, userId, text]
  )

  return { status: 'success', data: { answerId } }
})
