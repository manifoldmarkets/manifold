import { z } from 'zod'

import { authEndpoint, validate } from './helpers'
import { updateUserInterestEmbedding } from 'shared/helpers/embeddings'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { repopulateNewUsersFeedFromEmbeddings } from 'shared/supabase/users'

const bodySchema = z.object({
  userId: z.string(),
})

export const updateUserEmbedding = authEndpoint(async (req, auth) => {
  const pg = createSupabaseDirectClient()

  const { userId } = validate(bodySchema, req.body)
  await updateUserInterestEmbedding(pg, userId)
  await repopulateNewUsersFeedFromEmbeddings(userId, pg, true)
  return { success: true }
})
