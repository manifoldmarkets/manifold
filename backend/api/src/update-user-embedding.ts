import { authEndpoint } from './helpers'
import { updateUserInterestEmbedding } from 'shared/helpers/embeddings'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { generateNewUserFeedFromContracts } from 'shared/supabase/users'
import { ALL_FEED_USER_ID } from 'common/feed'
import { getMemberGroupSlugs } from 'shared/supabase/groups'
import { getImportantContractsForNewUsers } from 'shared/supabase/contracts'

export const updateUserEmbedding = authEndpoint(async (req, auth) => {
  const pg = createSupabaseDirectClient()

  await updateUserInterestEmbedding(pg, auth.uid)
  const groupSlugs = await getMemberGroupSlugs(auth.uid, pg)
  const contractIds = await getImportantContractsForNewUsers(
    300,
    pg,
    groupSlugs
  )
  await generateNewUserFeedFromContracts(
    auth.uid,
    pg,
    ALL_FEED_USER_ID,
    contractIds,
    1
  )

  return { success: true }
})
