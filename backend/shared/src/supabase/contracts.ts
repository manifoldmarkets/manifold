import { SupabaseClient, SupabaseDirectClient } from 'shared/supabase/init'
import { groupBy, reduce, sum, uniq } from 'lodash'
import { getUserFollowerIds } from 'shared/supabase/users'
import {
  CONTRACT_FEED_REASON_TYPES,
  FEED_DATA_TYPES,
  getRelevanceScore,
  INTEREST_DISTANCE_THRESHOLDS,
  MINIMUM_SCORE,
} from 'common/feed'
import { Contract } from 'common/contract'
import {
  unitVectorCosineDistance,
  userInterestEmbeddings,
} from 'shared/supabase/vectors'
import { log } from 'shared/utils'
import { DEEMPHASIZED_GROUP_SLUGS, isAdminId } from 'common/envs/constants'
import { convertContract } from 'common/supabase/contracts'
import { generateEmbeddings } from 'shared/helpers/openai-utils'
import { TOPIC_IDS_YOU_CANT_FOLLOW } from 'common/supabase/groups'
import { APIError } from 'common/api/utils'

// used for API to allow slug as param
export const getContractIdFromSlug = async (
  db: SupabaseClient,
  slug?: string
) => {
  if (!slug) return undefined

  const { data, error } = await db
    .from('contracts')
    .select('id')
    .eq('slug', slug)
    .single()

  if (error) throw new APIError(404, `Contract with slug ${slug} not found`)
  return data.id
}

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

export const getUniqueVoterIds = async (
  contractId: string,
  pg: SupabaseDirectClient
) => {
  return await pg.map(
    `select distinct user_id
       from votes cb
        where contract_id = $1
       `,
    [contractId],
    (r) => r.user_id
  )
}

export const getContractsDirect = async (
  contractIds: string[],
  pg: SupabaseDirectClient
) => {
  if (contractIds.length === 0) return [] as Contract[]

  return await pg.map(
    `select data, importance_score from contracts where id in ($1:list)`,
    [contractIds],
    (r) => convertContract(r)
  )
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

export const getContractGroupMemberIds = async (
  contractId: string,
  ignoringGroupIds: string[],
  pg: SupabaseDirectClient
) => {
  const contractGroups = await pg.manyOrNone(
    `select distinct group_id  from group_contracts
                where contract_id = $1`,
    [contractId]
  )
  const groupIds = contractGroups
    .map((cg) => cg.group_id)
    .filter((g) => !ignoringGroupIds.includes(g))

  if (groupIds.length === 0) return []
  const contractGroupMemberIds = await pg.manyOrNone<{ member_id: string }>(
    `select distinct member_id from group_members
                where group_id = any($1)`,
    [groupIds]
  )
  return contractGroupMemberIds.map((r) => r.member_id)
}

export const getUsersWithSimilarInterestVectorsToContract = async (
  contractId: string,
  pg: SupabaseDirectClient,
  interestDistanceThreshold = 0.125,
  probes = 10,
  userIds: string[] | null = null
): Promise<{ [key: string]: number }> => {
  const userDistanceMap: { [key: string]: number } = {}

  await pg.tx(async (t) => {
    await t.none('SET LOCAL ivfflat.probes = $1', [probes])
    await t.map(
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
              where ($4::text[] is null or ue.user_id = any($4::text[]))
          ) as distances
       where
           interest_distance < $2 and score > $3
      `,
      [contractId, interestDistanceThreshold, MINIMUM_SCORE, userIds],
      (r: { user_id: string; interest_distance: number }) => {
        userDistanceMap[r.user_id] = r.interest_distance
      }
    )
  })
  // Note: this will not include keys for users with scores below the threshold
  return userDistanceMap
}

export const getUsersWithSimilarInterestVectorsToContractServerSide = async (
  contractId: string,
  pg: SupabaseDirectClient,
  interestDistanceThreshold = 0.125
): Promise<{ [key: string]: number }> => {
  const contractEmbedding = (
    await pg.map(
      'select embedding from contract_embeddings where contract_id = $1',
      [contractId],
      (row) => JSON.parse(row.embedding) as number[]
    )
  ).flat()

  const userEmbeddingsCount = Object.keys(userInterestEmbeddings).length
  if (userEmbeddingsCount === 0)
    throw new Error('userInterestEmbeddings is not loaded')
  else log('found ' + userEmbeddingsCount + ' user interest embeddings to use')

  const userDistanceMap: { [key: string]: number } = {}
  Object.entries(userInterestEmbeddings).forEach(([userId, user]) => {
    const interestDistance = unitVectorCosineDistance(
      contractEmbedding,
      user.interest
    )
    if (interestDistance > interestDistanceThreshold) return

    const disinterestDistance = user.disinterest
      ? unitVectorCosineDistance(contractEmbedding, user.disinterest)
      : 1
    const score = disinterestDistance - interestDistance
    if (score > MINIMUM_SCORE) userDistanceMap[userId] = interestDistance
  })

  return userDistanceMap
}

// Helpful firebase deploy arguments after changing the following function
// functions:onCreateContract,functions:onCreateCommentOnContract,functions:onCreateLiquidityProvision,functions:addcontractstofeed
export const getUserToReasonsInterestedInContractAndUser = async (
  contract: Contract,
  creatorId: string,
  pg: SupabaseDirectClient,
  reasonsToInclude: CONTRACT_FEED_REASON_TYPES[],
  serverSideCalculation: boolean,
  dataType: FEED_DATA_TYPES,
  trendingContractType?: 'old' | 'new',
  addRandomnessToGroupScore = false,
  // This can be deleted after removing all users from these groups
  ignoringGroupIds = TOPIC_IDS_YOU_CANT_FOLLOW
): Promise<{
  [userId: string]: {
    reasons: CONTRACT_FEED_REASON_TYPES[]
    relevanceScore: number
  }
}> => {
  const { id: contractId, importanceScore } = contract

  const reasonsToRelevantUserIdsFunctions: {
    [key in CONTRACT_FEED_REASON_TYPES]: {
      users?: Promise<string[]>
      usersToDistances?: Promise<{ [key: string]: number }>
    }
  } = {
    follow_contract: {
      users: getContractFollowerIds(contractId, pg),
    },
    liked_contract: {
      users: getContractLikerIds(contractId, pg),
    },
    follow_user: {
      users: getUserFollowerIds(creatorId, pg),
    },
    contract_in_group_you_are_in: {
      users: getContractGroupMemberIds(contractId, ignoringGroupIds, pg),
    },
    similar_interest_vector_to_contract: {
      usersToDistances: serverSideCalculation
        ? getUsersWithSimilarInterestVectorsToContractServerSide(
            contractId,
            pg,
            INTEREST_DISTANCE_THRESHOLDS[dataType]
          )
        : getUsersWithSimilarInterestVectorsToContract(
            contractId,
            pg,
            INTEREST_DISTANCE_THRESHOLDS[dataType]
          ),
    },
  }

  const promises = Object.entries(reasonsToRelevantUserIdsFunctions).map(
    async ([reason, { users, usersToDistances }]) => {
      if (!reasonsToInclude.includes(reason as CONTRACT_FEED_REASON_TYPES))
        return []

      if (usersToDistances) {
        const userToScoreMap = await usersToDistances
        return Object.entries(userToScoreMap).map(
          ([userId, interestDistance]) => [userId, reason, interestDistance]
        )
      }

      const userIds = await (users ?? Promise.resolve([]))
      return userIds.map((userId) => [userId, reason, 0])
    }
  ) as Promise<[string, CONTRACT_FEED_REASON_TYPES, number][]>[]

  const results = await Promise.all(promises)

  const groupedByUserId = groupBy(results.flat(), (result) => result[0])

  return reduce(
    groupedByUserId,
    (acc, values, userId) => {
      const interestDistance = sum(values.map(([, , score]) => score))
      const reasons = values.map(([, reason]) => reason)
      const score = getRelevanceScore(
        dataType,
        reasons,
        importanceScore,
        interestDistance,
        trendingContractType,
        addRandomnessToGroupScore
      )
      acc[userId] = {
        reasons,
        relevanceScore: score,
      }

      return acc
    },
    {} as {
      [userId: string]: {
        reasons: CONTRACT_FEED_REASON_TYPES[]
        relevanceScore: number
      }
    }
  )
}

export const isContractNonPredictive = (contract: Contract) => {
  const questionIncludesDailyCoinflip = contract.question
    .trim()
    .toLowerCase()
    .includes('daily coinflip')
  const createdByManifoldLove = contract.creatorUsername === 'ManifoldLove'
  return questionIncludesDailyCoinflip || createdByManifoldLove
  // return (
  //   await pg.map(
  //     `
  //   select
  //   ((select embedding from contract_embeddings where contract_id = $1)
  //        <=>
  //       (select embedding from group_embeddings where group_id = $2)) as distance`,
  //     [contract.id, NON_PREDICTIVE_GROUP_ID],
  //     (row) => row.distance < 0.11
  //   )
  // )[0]
}

export const getContractPrivacyWhereSQLFilter = (
  uid: string | undefined,
  creatorId?: string,
  groupId?: string,
  hasGroupAccess?: boolean,
  contractIdString = 'id',
  includePrivateMarkets = false
) => {
  const otherVisibilitySQL = `
  OR (visibility = 'unlisted' 
    AND (
     creator_id='${uid}'
     OR ${isAdminId(uid ?? '_')}
     OR exists(
         select 1 from contract_bets where contract_id = ${contractIdString} and user_id = '${uid}')
     )) 
     ${
       // Included when viewing your own contract metrics or your own markets
       includePrivateMarkets || creatorId === uid
         ? `OR (visibility = 'private' AND can_access_private_contract(${contractIdString},'${uid}'))`
         : ''
     }
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

export const getImportantContractsForNewUsers = async (
  targetCount: number,
  pg: SupabaseDirectClient,
  groupSlugs: string[] | null = null
): Promise<string[]> => {
  let contractIds: string[] = []
  let threshold = 0.5
  const ignoreSlugs = DEEMPHASIZED_GROUP_SLUGS.filter(
    (s) => !groupSlugs?.includes(s)
  )
  while (contractIds.length < targetCount && threshold > 0.2) {
    const ids = await pg.map(
      `select id
       from contracts
       where group_slugs is not null
         and ($1::text[] is null or group_slugs && $1)
         and not exists (
           select 1
           from unnest(group_slugs) as t(slug)
           where (slug = any($2) or slug ilike '%manifold%')
         )
         and resolution_time is null
         and deleted = false
         and visibility = 'public'
         and importance_score > $3
       order by importance_score desc
       limit $4`,
      [groupSlugs, ignoreSlugs, threshold, targetCount],
      (r) => r.id as string
    )

    contractIds = uniq(contractIds.concat(ids))
    threshold -= 0.02
  }

  return contractIds
}
export const generateContractEmbeddings = async (
  contract: Contract,
  pg: SupabaseDirectClient
) => {
  const embedding = await generateEmbeddings(contract.question)
  if (!embedding) return

  return await pg.one(
    `insert into contract_embeddings (contract_id, embedding)
            values ($1, $2)
            on conflict (contract_id) do nothing
            returning embedding
          `,
    [contract.id, embedding]
  )
}
