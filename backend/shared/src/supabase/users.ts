import { SupabaseDirectClient } from 'shared/supabase/init'
import { DEFAULT_EMBEDDING_DISTANCE_PROBES } from 'common/embeddings'

export const getUserFollowerIds = async (
  userId: string,
  pg: SupabaseDirectClient
) => {
  const userFollowerIds = await pg.manyOrNone<{ follow_id: string }>(
    `select user_id from user_follows where follow_id = $1`,
    [userId]
  )
  return userFollowerIds.map((r) => r.follow_id)
}

export const getUsersWithSimilarInterestVectorToUser = async (
  userId: string,
  pg: SupabaseDirectClient,
  // -- user id used: AJwLWoo3xue32XIiAVrL5SyR1WB2, distance: .01
  // -- probes at 5: 861 rows, 240 ms
  // -- probes at 3: 814 rows, 115 ms
  // -- probes at 1: 215 rows, 30ms
  // Probably don't need more than 5
  probes = 3
) => {
  const userIdsAndDistances = await pg.tx(async (t) => {
    await t.none('SET ivfflat.probes = $1', [probes])
    const res = await t.manyOrNone(
      `
    with pe as (select interest_embedding
                 from user_embeddings
                 where user_id = $1)
   select user_id, distance
   from (
            select ue.user_id, (select interest_embedding from pe) <=> ue.interest_embedding as distance
            from user_embeddings as ue
        ) as distances
   where distance < 0.01
   order by distance
   limit 1000
  `,
      [userId]
    )
    await t.none('SET ivfflat.probes = $1', [DEFAULT_EMBEDDING_DISTANCE_PROBES])
    return res
  })

  return userIdsAndDistances.map((r) => r.user_id).filter((id) => id !== userId)
}
