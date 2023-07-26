import { authEndpoint } from './helpers'
import { updateUserInterestEmbedding } from 'shared/helpers/embeddings'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  populateNewUsersFeedFromDefaultFeed,
  spiceUpNewUsersFeedBasedOnTheirInterests,
} from 'shared/supabase/users'

export const updateUserEmbedding = authEndpoint(async (req, auth) => {
  const pg = createSupabaseDirectClient()

  await updateUserInterestEmbedding(pg, auth.uid)
  await spiceUpNewUsersFeedBasedOnTheirInterests(auth.uid, pg)

  return { success: true }
})
