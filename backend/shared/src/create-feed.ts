import {
  createSupabaseDirectClient,
  pgp,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { Comment } from 'common/comment'
import { getUserToReasonsInterestedInContractAndUser } from 'shared/supabase/contracts'
import { Contract } from 'common/contract'
import {
  ALL_FEED_USER_ID,
  CONTRACT_FEED_REASON_TYPES,
  FEED_DATA_TYPES,
  FEED_REASON_TYPES,
} from 'common/feed'
import { log } from 'shared/utils'
import { convertObjectToSQLRow, Row } from 'common/supabase/utils'
import { getMostlyActiveUserIds } from 'shared/supabase/users'

export const bulkInsertDataToUserFeed = async (
  usersToReasonsInterestedInContract: {
    [userId: string]: {
      reasons: FEED_REASON_TYPES[]
      relevanceScore: number
    }
  },
  eventTime: number,
  dataType: FEED_DATA_TYPES,
  userIdsToExclude: string[],
  dataProps: {
    contractId?: string
    commentId?: string
    creatorId?: string
    data?: any
    idempotencyKey?: string
    postId?: number
    betId?: string
  },
  pg: SupabaseDirectClient
) => {
  const eventTimeTz = new Date(eventTime).toISOString()

  const feedRows = Object.entries(usersToReasonsInterestedInContract)
    .filter(([userId]) => !userIdsToExclude.includes(userId))
    .concat([
      [
        ALL_FEED_USER_ID,
        { reasons: ['similar_interest_vector_to_contract'], relevanceScore: 1 },
      ],
    ])
    .map(([userId, reasonAndScore]) =>
      convertObjectToSQLRow<any, 'user_feed'>({
        ...dataProps,
        userId,
        ...reasonAndScore,
        dataType,
        eventTime: eventTimeTz,
      })
    )
  if (feedRows.length === 0) return
  const cs = new pgp.helpers.ColumnSet(feedRows[0], { table: 'user_feed' })
  const insert = pgp.helpers.insert(feedRows, cs) + ` ON CONFLICT DO NOTHING`
  await pg.none(insert)
  log?.(`Inserted ${feedRows.length} feed rows of type ${dataType}`)
}

export const createManualTrendingFeedRow = (
  contracts: Contract[],
  forUserId: string,
  estimatedRelevance: number
) => {
  const now = Date.now()
  const reasons: FEED_REASON_TYPES[] = [
    'similar_interest_vector_to_contract',
    'contract_in_group_you_are_in',
  ]
  return contracts.map(
    (contract) =>
      convertObjectToSQLRow<any, 'user_feed'>({
        contractId: contract.id,
        creatorId: contract.creatorId,
        userId: forUserId,
        eventTime: new Date(now).toISOString(),
        dataType: 'trending_contract',
        reasons,
        relevanceScore: contract.importanceScore * estimatedRelevance,
      }) as Row<'user_feed'>
  )
}

export const repostContractToFeed = async (
  contract: Contract,
  comment: Comment,
  creatorId: string,
  postId: number,
  userIdsToExclude: string[],
  betId?: string
) => {
  const pg = createSupabaseDirectClient()
  const usersToReasonsInterestedInContract =
    await getUserToReasonsInterestedInContractAndUser(
      contract,
      creatorId,
      pg,
      [
        'follow_user',
        'follow_contract', // unsure which of these will work besides follow_user
        'contract_in_group_you_are_in',
      ],
      'repost',
      0.025
    )
  log(
    `Reposting contract ${contract.id} to ${
      Object.keys(usersToReasonsInterestedInContract).length
    } users`
  )
  const mostlyActiveUserIds = await getMostlyActiveUserIds(
    pg,
    0.05, // 5% of inactive users get these contracts to their feed
    Object.keys(usersToReasonsInterestedInContract)
  )
  await bulkInsertDataToUserFeed(
    usersToReasonsInterestedInContract,
    comment.createdTime,
    'repost',
    userIdsToExclude.concat(
      Object.keys(usersToReasonsInterestedInContract).filter(
        (id) => !mostlyActiveUserIds.includes(id)
      )
    ),
    {
      contractId: contract.id,
      commentId: comment.id,
      creatorId,
      betId,
      postId,
    },
    pg
  )
}
export const addContractToFeed = async (
  contract: Contract,
  reasonsToInclude: CONTRACT_FEED_REASON_TYPES[],
  dataType: FEED_DATA_TYPES,
  userIdsToExclude: string[],
  options: {
    userIdResponsibleForEvent?: string
    idempotencyKey?: string
  }
) => {
  const { idempotencyKey, userIdResponsibleForEvent } = options
  const pg = createSupabaseDirectClient()
  const usersToReasonsInterestedInContract =
    await getUserToReasonsInterestedInContractAndUser(
      contract,
      userIdResponsibleForEvent ?? contract.creatorId,
      pg,
      reasonsToInclude,
      dataType,
      contract.isRanked === false || contract.isSubsidized === false ? 0 : 0.2
    )
  const mostlyActiveUserIds = await getMostlyActiveUserIds(
    pg,
    0.05, // 5% of inactive users get these contracts to their feed
    Object.keys(usersToReasonsInterestedInContract)
  )
  await bulkInsertDataToUserFeed(
    usersToReasonsInterestedInContract,
    contract.createdTime,
    dataType,
    userIdsToExclude.concat(
      Object.keys(usersToReasonsInterestedInContract).filter(
        (id) => !mostlyActiveUserIds.includes(id)
      )
    ),
    {
      contractId: contract.id,
      creatorId: contract.creatorId,
      idempotencyKey,
    },
    pg
  )
  log(
    `Added contract ${contract.id} to feed of ${
      Object.keys(usersToReasonsInterestedInContract).length
    } users`
  )
}
