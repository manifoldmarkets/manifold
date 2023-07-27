import { SupabaseDirectClient } from 'shared/supabase/init'
import { fromPairs, map, merge, sortBy } from 'lodash'
import { getUserFollowerIds } from 'shared/supabase/users'
import {
  ALL_FEED_USER_ID,
  CONTRACT_OR_USER_FEED_REASON_TYPES,
  MINIMUM_SCORE,
} from 'common/feed'
import { Contract } from 'common/contract'

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

export const getUniqueBettorIdsForAnswer = async (
  contractId: string,
  answerId: string,
  pg: SupabaseDirectClient
) => {
  const res = await pg.manyOrNone(
    `select distinct user_id
      from contract_bets
      where contract_id = $1
      and data->>'answerId' = $2
      and is_redemption = false`,
    [contractId, answerId]
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

export const getUsersWithSimilarInterestVectorsToContract = async (
  contractId: string,
  pg: SupabaseDirectClient,
  // -- distance of .125, probes at 10, lists at 500
  // -- chatbot 2k traders: 2k users, contract id: 5ssg7ccYrrsEwZLYh9tP
  // -- isaac king 40 traders: 1.8k users, contract id:  CPa23v0jJykJMhUjgT9J
  // -- taiwan fighter 5 traders, 500 users, contract id:  a4tsshKK3MCE8PvS7Yfv
  interestDistanceThreshold = 0.125,
  // -- contract id used: 5ssg7ccYrrsEwZLYh9tP, distance: .125
  // -- probes at 10: 2k rows, 200 ms
  // -- probes at 5: 600 rows, 65 ms
  // -- probes at 1: 71 rows, 10ms
  probes = 10
): Promise<string[]> => {
  const userIdsAndDistances = await pg.tx(async (t) => {
    await t.none('SET LOCAL ivfflat.probes = $1', [probes])
    const res = await t.manyOrNone(
      `with ce as (
        select embedding
        from contract_embeddings
        where contract_id = $1
    )
     select user_id, interest_distance, score, created_at
     from (
              select ue.user_id,
                     (select embedding from ce) <=> ue.interest_embedding as interest_distance,
                     ue.created_at as created_at,
                     (COALESCE((select embedding from ce) <=> ue.disinterest_embedding, 1)
                          - ((select embedding from ce) <=> ue.interest_embedding)) AS score
              from user_embeddings as ue
          ) as distances
       where
           interest_distance < $2 and score > $3
      `,
      [contractId, interestDistanceThreshold, MINIMUM_SCORE]
    )
    return res
  })
  return userIdsAndDistances.map((r) => r.user_id)
}
// Helpful firebase deploy arguments after changing the following function
// functions:onCreateContract,functions:onCreateCommentOnContract,functions:onCreateLiquidityProvision,functions:scorecontracts
export const getUserToReasonsInterestedInContractAndUser = async (
  contract: Contract,
  userId: string,
  pg: SupabaseDirectClient,
  reasonsToInclude: CONTRACT_OR_USER_FEED_REASON_TYPES[],
  userToContractDistanceThreshold: number
): Promise<{ [userId: string]: CONTRACT_OR_USER_FEED_REASON_TYPES }> => {
  const { id: contractId } = contract
  const reasonsToRelevantUserIdsFunctions: {
    [key in CONTRACT_OR_USER_FEED_REASON_TYPES]: {
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
    follow_user: {
      promise: getUserFollowerIds(userId, pg),
      importance: 4,
    },
    contract_in_group_you_are_in: {
      promise: getContractGroupMemberIds(contractId, pg),
      importance: 5,
    },
    similar_interest_vector_to_contract: {
      promise: getUsersWithSimilarInterestVectorsToContract(
        contractId,
        pg,
        userToContractDistanceThreshold
      ),
      importance: 7,
    },
    private_contract_shared_with_you: {
      promise: getUsersWithAccessToContract(contract, pg),
      importance: 8,
    },
  }

  const reasons =
    contract.visibility === 'private'
      ? ['private_contract_shared_with_you' as const]
      : sortBy(
          reasonsToInclude
            ? reasonsToInclude
            : (Object.keys(
                reasonsToRelevantUserIdsFunctions
              ) as CONTRACT_OR_USER_FEED_REASON_TYPES[]),
          (reason) => reasonsToRelevantUserIdsFunctions[reason].importance
        )

  const promises = reasons.map(
    (reason) => reasonsToRelevantUserIdsFunctions[reason].promise
  )

  const results = await Promise.all(promises)

  return merge(
    { [ALL_FEED_USER_ID]: 'similar_interest_vector_to_news_vector' },
    ...results
      .map((result, index) => {
        const reason = reasons[index]
        return fromPairs(map(result, (key) => [key, reason]))
      })
      // We reverse the list as merge will overwrite prior keys with later keys
      .reverse()
  )
}

export const isContractLikelyNonPredictive = async (
  contractId: string,
  pg: SupabaseDirectClient
): Promise<boolean> => {
  return (
    await pg.map(
      `
    with topic_embedding as
    (
      select embedding from topic_embeddings
      where topic = 'Non-Predictive'
    )
    select
    ((select embedding from contract_embeddings where contract_id = $1)
         <=>
        (select embedding from topic_embedding)) as distance`,
      [contractId],
      (row) => row.distance < 0.1
    )
  )[0]
}

export const getContractPrivacyWhereSQLFilter = (
  uid: string | undefined,
  creatorId?: string,
  groupId?: string,
  hasGroupAccess?: boolean
) => {
  const otherVisibilitySQL = `
  OR (visibility = 'unlisted' AND creator_id='${uid}') 
  OR (visibility = 'private' AND can_access_private_contract(id,'${uid}'))
  `
  return (groupId && hasGroupAccess) ||
    (!!creatorId && !!uid && creatorId === uid)
    ? ''
    : `(visibility = 'public' ${uid ? otherVisibilitySQL : ''})`
}

export const getUsersWithAccessToContract = async (
  contract: Contract,
  pg: SupabaseDirectClient
): Promise<string[]> => {
  return await pg.map(
    `
    select member_id FROM group_members
    JOIN group_contracts ON group_members.group_id = group_contracts.group_id
    WHERE group_contracts.contract_id = $1
    `,
    [contract.id],
    (row: { member_id: string }) => row.member_id
  )
}
