import { SupabaseDirectClient } from 'shared/supabase/init'
import { fromPairs, map, merge, sortBy } from 'lodash'
import {
  getUserFollowerIds,
  getUsersWithSimilarInterestVectorToUser,
} from 'shared/supabase/users'
import { FEED_REASON_TYPES } from 'common/feed'
import { DEFAULT_EMBEDDING_DISTANCE_PROBES } from 'common/embeddings'

export const getUniqueBettorIds = async (
  contractId: string,
  pg: SupabaseDirectClient
) => {
  const res = await pg.manyOrNone(
    `
      select
          distinct user_id
      from contract_bets
        where contract_id = $1`,
    [contractId]
  )
  return res.map((r) => r.user_id as string)
}

export const getContractFollowerIds = async (
  contractId: string,
  pg: SupabaseDirectClient
) => {
  const followerIds = await pg.manyOrNone<{ follow_id: string }>(
    `select follow_id from contract_follows where contract_id = $1`,
    [contractId]
  )
  return followerIds.map((f) => f.follow_id)
}

export const getContractLikerIds = async (
  contractId: string,
  pg: SupabaseDirectClient
) => {
  const likedUserIds = await pg.manyOrNone<{ user_id: string }>(
    `select user_id from user_reactions 
               where (data->>'contentId') = $1
               and (data->>'type') = 'like'
               and (data->>'contentType') = 'contract'`,
    [contractId]
  )
  return likedUserIds.map((r) => r.user_id)
}

// TODO: explain analyze this query after repacking - the table was packed around the wrong index
export const getContractViewerIds = async (
  contractId: string,
  pg: SupabaseDirectClient
) => {
  const viewerIds = await pg.manyOrNone<{ user_id: string }>(
    `select distinct user_id from user_seen_markets
                where contract_id = $1
                and type = 'view market'`,
    [contractId]
  )
  return viewerIds.map((r) => r.user_id)
}

//TODO: perhaps we should also factor in the member's interest vector for e.g.
// the huge groups like economics-default
export const getContractGroupMemberIds = async (
  contractId: string,
  pg: SupabaseDirectClient
) => {
  const contractGroups = await pg.manyOrNone(
    `select distinct group_id  from group_contracts
                where contract_id = $1`,
    [contractId]
  )
  const contractGroupMemberIds = await pg.manyOrNone<{ member_id: string }>(
    `select distinct member_id from group_members
                where group_id = any($1)`,
    [contractGroups.map((cg) => cg.group_id)]
  )
  return contractGroupMemberIds.map((r) => r.member_id)
}

const getUsersWithSimilarInterestVectorsToContract = async (
  contractId: string,
  pg: SupabaseDirectClient,
  // -- distance of .125, probes at 10, lists at 500
  // -- chatbot 2k traders: 2k users, contract id: 5ssg7ccYrrsEwZLYh9tP
  // -- isaac king 40 traders: 1.8k users, contract id:  CPa23v0jJykJMhUjgT9J
  // -- taiwan fighter 5 traders, 500 users, contract id:  a4tsshKK3MCE8PvS7Yfv
  distanceThreshold = 0.125,
  // -- contract id used: 5ssg7ccYrrsEwZLYh9tP, distance: .125
  // -- probes at 10: 2k rows, 200 ms
  // -- probes at 5: 600 rows, 65 ms
  // -- probes at 1: 71 rows, 10ms
  // If you go higher than 11 the planner will stop using the index and likely 2/3x your execution time
  probes = 10
): Promise<string[]> => {
  const userIdsAndDistances = await pg.tx(async (t) => {
    await t.none('SET ivfflat.probes = $1', [probes])
    const res = await t.manyOrNone(
      `with ce as (
        select embedding
        from contract_embeddings
        where contract_id = $1
    )
     select user_id, distance
     from (
              select ue.user_id, (select embedding from ce) <=> ue.interest_embedding as distance
              from user_embeddings as ue
          ) as distances
     where distance < $2
     order by distance
     limit 5000;
    `,
      [contractId, distanceThreshold]
    )
    await t.none('SET ivfflat.probes = $1', [DEFAULT_EMBEDDING_DISTANCE_PROBES])
    return res
  })
  return userIdsAndDistances.map((r) => r.user_id)
}

export const getUserToReasonsInterestedInContractAndUser = async (
  contractId: string,
  userId: string,
  pg: SupabaseDirectClient,
  reasonsToInclude?: FEED_REASON_TYPES[],
  userToContractDistanceThreshold?: number
): Promise<{ [userId: string]: FEED_REASON_TYPES }> => {
  const reasonsToRelevantUserIdsFunctions: {
    [key in FEED_REASON_TYPES]: {
      promise: Promise<string[]>
      importance: number
    }
  } = {
    follow_contract: {
      promise: getContractFollowerIds(contractId, pg),
      importance: 1,
    },
    liked_contract: {
      promise: getContractLikerIds(contractId, pg),
      importance: 2,
    },
    viewed_contract: {
      promise: getContractViewerIds(contractId, pg),
      importance: 3,
    },
    follow_user: {
      promise: getUserFollowerIds(userId, pg),
      importance: 4,
    },
    contract_in_group_you_are_in: {
      promise: getContractGroupMemberIds(contractId, pg),
      importance: 5,
    },
    similar_interest_vector_to_user: {
      promise: getUsersWithSimilarInterestVectorToUser(userId, pg),
      importance: 6,
    },
    similar_interest_vector_to_contract: {
      promise: getUsersWithSimilarInterestVectorsToContract(
        contractId,
        pg,
        userToContractDistanceThreshold
      ),
      importance: 7,
    },
  }

  const reasons = sortBy(
    reasonsToInclude
      ? reasonsToInclude
      : (Object.keys(reasonsToRelevantUserIdsFunctions) as FEED_REASON_TYPES[]),
    (reason) => reasonsToRelevantUserIdsFunctions[reason].importance
  )

  const promises = reasons.map(
    (reason) => reasonsToRelevantUserIdsFunctions[reason].promise
  )

  const results = await Promise.all(promises)

  return merge(
    {},
    ...results
      .map((result, index) => {
        const reason = reasons[index]
        return fromPairs(map(result, (key) => [key, reason]))
      })
      // We reverse the list as merge will overwrite prior keys with later keys
      .reverse()
  )
}
