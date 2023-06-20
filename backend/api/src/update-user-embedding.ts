import { z } from 'zod'

import { authEndpoint, validate } from './helpers'
import { updateUserInterestEmbedding } from 'shared/helpers/embeddings'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { populateNewUsersFeedFromEmbeddings } from 'shared/supabase/users'

const bodySchema = z.object({
  userId: z.string(),
})

export const updateUserEmbedding = authEndpoint(async (req, auth) => {
  const pg = createSupabaseDirectClient()

  const { userId } = validate(bodySchema, req.body)
  await updateUserInterestEmbedding(pg, userId)
  await populateNewUsersFeedFromEmbeddings(userId, pg)
  return { success: true }
})
