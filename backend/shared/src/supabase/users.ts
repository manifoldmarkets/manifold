import { SupabaseDirectClient } from 'shared/supabase/init'
import { uniq } from 'lodash'

const getUserFollowerIds = async (userId: string, pg: SupabaseDirectClient) => {
  const userFollowerIds = await pg.manyOrNone<{ follow_id: string[] }>(
    `select follow_id from user_follows where user_id = $1`,
    [userId]
  )
  return userFollowerIds.map((r) => r.follow_id)
}

const getUserWithInterestVectorsNearToUser = async (
  userId: string,
  pg: SupabaseDirectClient
) => {
  const userIdsAndDistances = await pg.manyOrNone(
    `with pe as (select interest_embedding
                 from user_embeddings
                 where user_id = $1)
     select ue.user_id,
            (select interest_embedding from pe) <=> ue.interest_embedding as distance
     from user_embeddings as ue
     where (select interest_embedding from pe) <=> ue.interest_embedding < 0.005
     order by (select interest_embedding from pe) <=> ue.interest_embedding
     limit 1000;
    `,
    [userId]
  )
  return userIdsAndDistances.map((r) => r.user_id).filter((id) => id !== userId)
}
// TODO: attach reasons to user ids
export const getUserIdsInterestedInUser = async (
  userId: string,
  pg: SupabaseDirectClient
) => {
  const userFollowerIds = await getUserFollowerIds(userId, pg)
  const usersWithNearInterestVectors =
    await getUserWithInterestVectorsNearToUser(userId, pg)
  return uniq([...userFollowerIds, ...usersWithNearInterestVectors])
}
