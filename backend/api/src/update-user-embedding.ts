import { type APIHandler } from './helpers/endpoint'
import { updateUserInterestEmbedding } from 'shared/helpers/embeddings'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { generateNewUserFeedFromContracts } from 'shared/supabase/users'
import { ALL_FEED_USER_ID } from 'common/feed'
import { getMemberGroupSlugs } from 'shared/supabase/groups'
import { getImportantContractsForNewUsers } from 'shared/supabase/contracts'
import { PROD_MANIFOLD_LOVE_GROUP_SLUG } from 'common/envs/constants'

export const updateUserEmbedding: APIHandler<'update-user-embedding'> = async (
  _,
  auth,
  { log }
) => {
  return {
    result: { success: true },
    continue: async () => {
      const pg = createSupabaseDirectClient()
      await updateUserInterestEmbedding(pg, auth.uid)
      const groupSlugs = await getMemberGroupSlugs(auth.uid, pg)
      const contractIds = await getImportantContractsForNewUsers(
        100,
        pg,
        groupSlugs.filter((slug) => slug !== PROD_MANIFOLD_LOVE_GROUP_SLUG)
      )
      await generateNewUserFeedFromContracts(
        auth.uid,
        pg,
        ALL_FEED_USER_ID,
        contractIds,
        1,
        log
      )
    },
  }
}
