import { z } from 'zod'

import { authEndpoint, validate } from './helpers'
import { updateUserInterestEmbedding } from 'shared/helpers/embeddings'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { repopulateNewUsersFeedFromEmbeddings } from 'shared/supabase/users'

export const updateUserEmbedding = authEndpoint(async (req, auth) => {
  const pg = createSupabaseDirectClient()

  await updateUserInterestEmbedding(pg, auth.uid)
  await repopulateNewUsersFeedFromEmbeddings(auth.uid, pg, true)
  return { success: true }
})
