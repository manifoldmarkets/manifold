import { SupabaseDirectClient } from 'shared/supabase/init'

export const getUserFollowerIds = async (
  userId: string,
  pg: SupabaseDirectClient
) => {
  const userFollowerIds = await pg.manyOrNone<{ follow_id: string }>(
    `select follow_id from user_follows where user_id = $1`,
    [userId]
  )
  return userFollowerIds.map((r) => r.follow_id)
}

export const getUserWithSimilarInterestVectorToUser = async (
  userId: string,
  pg: SupabaseDirectClient
) => {
  const userIdsAndDistances = await pg.manyOrNone(
    `with pe as (select interest_embedding
                 from user_embeddings
                 where user_id = $1)
     select user_id, distance
     from (
              select ue.user_id, (select interest_embedding from pe) <=> ue.interest_embedding as distance
              from user_embeddings as ue
          ) as distances
     where distance < 0.005
     order by distance
     limit 1000`,
    [userId]
  )
  return userIdsAndDistances.map((r) => r.user_id).filter((id) => id !== userId)
}
