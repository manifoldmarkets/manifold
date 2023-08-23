import { authEndpoint } from './helpers'
import { updateUserInterestEmbedding } from 'shared/helpers/embeddings'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { spiceUpNewUsersFeedBasedOnTheirInterests } from 'shared/supabase/users'
import { ALL_FEED_USER_ID } from 'common/feed'

export const updateUserEmbedding = authEndpoint(async (req, auth) => {
  const pg = createSupabaseDirectClient()

  await updateUserInterestEmbedding(pg, auth.uid)
  await spiceUpNewUsersFeedBasedOnTheirInterests(
    auth.uid,
    pg,
    ALL_FEED_USER_ID,
    400
  )

  return { success: true }
})
