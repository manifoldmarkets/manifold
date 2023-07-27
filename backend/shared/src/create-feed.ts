import {
  createSupabaseDirectClient,
  pgp,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { Comment } from 'common/comment'
import { getUserToReasonsInterestedInContractAndUser } from 'shared/supabase/contracts'
import { Contract, CPMMContract } from 'common/contract'
import {
  CONTRACT_OR_USER_FEED_REASON_TYPES,
  FEED_DATA_TYPES,
  FEED_REASON_TYPES,
  INTEREST_DISTANCE_THRESHOLDS,
} from 'common/feed'
import { log } from 'shared/utils'
import { buildArray } from 'common/util/array'
import { getUsersWithSimilarInterestVectorToNews } from 'shared/supabase/users'
import { convertObjectToSQLRow } from 'common/supabase/utils'

export const bulkInsertDataToUserFeed = async (
  usersToReasonsInterestedInContract: {
    [userId: string]: FEED_REASON_TYPES
  },
  eventTime: number,
  dataType: FEED_DATA_TYPES,
  userIdsToExclude: string[],
  dataProps: {
    contractId?: string
    commentId?: string
    answerId?: string
    creatorId?: string
    betId?: string
    newsId?: string
    data?: any
    groupId?: string
    reactionId?: string
    idempotencyKey?: string
  },
  pg: SupabaseDirectClient
) => {
  const eventTimeTz = new Date(eventTime).toISOString()

  const feedRows = Object.entries(usersToReasonsInterestedInContract)
    .filter(([userId]) => !userIdsToExclude.includes(userId))
    .map(([userId, reason]) =>
      convertObjectToSQLRow<any, 'user_feed'>({
        ...dataProps,
        userId,
        reason,
        dataType,
        eventTime: eventTimeTz,
      })
    )
  if (feedRows.length === 0) return
  const cs = new pgp.helpers.ColumnSet(feedRows[0], { table: 'user_feed' })
  const insert = pgp.helpers.insert(feedRows, cs) + ` ON CONFLICT DO NOTHING`

  try {
    await pg.none(insert)
    log(`inserted ${feedRows.length} feed items`)
  } catch (e) {
    console.log('error inserting feed items')
    console.error(e)
  }
}

const userIdsWithFeedRowsMatchingContract = async (
  contractId: string,
  userIds: string[],
  seenTime: number,
  dataType: FEED_DATA_TYPES,
  pg: SupabaseDirectClient
) => {
  return await pg.map(
    `select distinct user_id
            from user_feed
            where contract_id = $1 and 
                user_id = ANY($2) and 
                (created_time > $3 or seen_time > $3) and
                data_type = $4
                `,
    [contractId, userIds, new Date(seenTime).toISOString(), dataType],
    (row: { user_id: string }) => row.user_id
  )
}

export const addCommentOnContractToFeed = async (
  contract: Contract,
  comment: Comment,
  userIdsToExclude: string[],
  idempotencyKey?: string
) => {
  const pg = createSupabaseDirectClient()
  const usersToReasonsInterestedInContract =
    await getUserToReasonsInterestedInContractAndUser(
      contract,
      comment.userId,
      pg,
      [
        'follow_contract',
        'follow_user',
        'liked_contract',
        'similar_interest_vector_to_contract',
      ],
      INTEREST_DISTANCE_THRESHOLDS.new_comment
    )
  await bulkInsertDataToUserFeed(
    usersToReasonsInterestedInContract,
    comment.createdTime,
    'new_comment',
    userIdsToExclude,
    {
      contractId: contract.id,
      commentId: comment.id,
      creatorId: comment.userId,
      idempotencyKey,
    },
    pg
  )
}
//TODO: before adding, exclude those users who:
// - have it in their notifications: users in reply thread, mentioned, creator of the contract
// - creator of the comment & reaction
// - have already seen the comment
// - already have the comment in their feed (unique by contract id, comment id, user id)
// export const addLikedCommentOnContractToFeed = async (
//   contractId: string,
//   reaction: Reaction,
//   comment: Comment,
//   userIdsToExclude: string[],
//   idempotencyKey?: string
// ) => {
//   const pg = createSupabaseDirectClient()
//   const usersToReasonsInterestedInContract =
//     await getUserToReasonsInterestedInContractAndUser(
//       contractId,
//       reaction.userId,
//       pg,
//       [
//         'follow_user',
//         'contract_in_group_you_are_in',
//         'similar_interest_vector_to_contract',
//       ],
//       INTEREST_DISTANCE_THRESHOLDS.popular_comment
//     )
//   await Promise.all(
//     Object.keys(usersToReasonsInterestedInContract).map(async (userId) =>
//       insertDataToUserFeed(
//         userId,
//         reaction.createdTime,
//         'popular_comment',
//         usersToReasonsInterestedInContract[userId],
//         userIdsToExclude,
//         {
//           contractId,
//           commentId: comment.id,
//           creatorId: reaction.userId,
//           reactionId: reaction.id,
//           idempotencyKey,
//         },
//         pg
//       )
//     )
//   )
// }

//TODO: run this when a contract gets its 1st comment, 5th bet, 1st like
// excluding those who:
// - have already seen this contract
// - already have it in their feed:  (unique by contract id, user id)
// - creator of the contract & reaction
export const addContractToFeed = async (
  contract: Contract,
  reasonsToInclude: CONTRACT_OR_USER_FEED_REASON_TYPES[],
  dataType: FEED_DATA_TYPES,
  userIdsToExclude: string[],
  options: {
    maxDistanceFromUserInterestToContract: number
    userIdResponsibleForEvent?: string
    idempotencyKey?: string
    currentProb?: number
    previousProb?: number
  }
) => {
  const {
    idempotencyKey,
    maxDistanceFromUserInterestToContract,
    userIdResponsibleForEvent,
    currentProb,
    previousProb,
  } = options
  const pg = createSupabaseDirectClient()
  const usersToReasonsInterestedInContract =
    await getUserToReasonsInterestedInContractAndUser(
      contract,
      userIdResponsibleForEvent ?? contract.creatorId,
      pg,
      reasonsToInclude,
      maxDistanceFromUserInterestToContract
    )
  await bulkInsertDataToUserFeed(
    usersToReasonsInterestedInContract,
    contract.createdTime,
    dataType,
    userIdsToExclude,
    {
      contractId: contract.id,
      creatorId: contract.creatorId,
      idempotencyKey,
      data: {
        currentProb,
        previousProb,
      },
    },
    pg
  )
  log(
    `Added contract ${contract.id} to feed of ${
      Object.keys(usersToReasonsInterestedInContract).length
    } users`
  )
}

export const addContractToFeedIfNotDuplicative = async (
  contract: Contract,
  reasonsToInclude: CONTRACT_OR_USER_FEED_REASON_TYPES[],
  dataType: FEED_DATA_TYPES,
  userIdsToExclude: string[],
  unseenNewerThanTime: number,
  options: {
    minUserInterestDistanceToContract: number
    data?: Record<string, any>
  }
) => {
  const { minUserInterestDistanceToContract, data } = options
  const pg = createSupabaseDirectClient()
  const usersToReasonsInterestedInContract =
    await getUserToReasonsInterestedInContractAndUser(
      contract,
      contract.creatorId,
      pg,
      reasonsToInclude,
      minUserInterestDistanceToContract
    )
  const ignoreUserIds = await userIdsWithFeedRowsMatchingContract(
    contract.id,
    Object.keys(usersToReasonsInterestedInContract),
    unseenNewerThanTime,
    dataType,
    pg
  )

  await bulkInsertDataToUserFeed(
    usersToReasonsInterestedInContract,
    contract.createdTime,
    dataType,
    userIdsToExclude.concat(ignoreUserIds),
    {
      contractId: contract.id,
      creatorId: contract.creatorId,
      data,
    },
    pg
  )
}

export const insertNewsToUsersFeeds = async (
  newsId: string,
  contracts: {
    id: string
    creatorId: string
  }[],
  groups: {
    id: string
    creatorId: string
  }[],
  eventTime: number,
  pg: SupabaseDirectClient
) => {
  const usersToReasons = await getUsersWithSimilarInterestVectorToNews(
    newsId,
    pg
  )
  console.log(
    'found users interested in news id',
    newsId,
    Object.keys(usersToReasons).length
  )

  await Promise.all(
    contracts.map(async (contract) => {
      await bulkInsertDataToUserFeed(
        usersToReasons,
        eventTime,
        'news_with_related_contracts',
        [],
        {
          contractId: contract.id,
          creatorId: contract.creatorId,
          newsId,
        },
        pg
      )
    })
  )
  await Promise.all(
    groups.map(async (group) => {
      await bulkInsertDataToUserFeed(
        usersToReasons,
        eventTime,
        // Should we change this to news_with_related_groups?
        'news_with_related_contracts',
        [],
        {
          groupId: group.id,
          creatorId: group.creatorId,
          newsId,
        },
        pg
      )
    })
  )
}
export const insertMarketMovementContractToUsersFeeds = async (
  contract: CPMMContract
) => {
  const nowDate = new Date()
  //TODO: Turn this into a select query, remove the idempotency key, add to top of feed
  //  as in trending contracts
  const idempotencyKey = `${
    contract.id
  }-prob-change-${nowDate.getFullYear()}-${nowDate.getMonth()}-${nowDate.getDate()}`
  await addContractToFeed(
    contract,
    buildArray([
      'follow_contract',
      'liked_contract',
      'similar_interest_vector_to_contract',
    ]),
    'contract_probability_changed',
    [],
    {
      maxDistanceFromUserInterestToContract:
        INTEREST_DISTANCE_THRESHOLDS.contract_probability_changed,
      idempotencyKey,
      currentProb: contract.prob,
      previousProb: contract.prob - contract.probChanges.day,
    }
  )
}
export const insertTrendingContractToUsersFeeds = async (
  contract: Contract,
  unseenNewerThanTime: number,
  data?: Record<string, any>
) => {
  await addContractToFeedIfNotDuplicative(
    contract,
    [
      'follow_contract',
      'liked_contract',
      'similar_interest_vector_to_contract',
    ],
    'trending_contract',
    [contract.creatorId],
    unseenNewerThanTime,
    {
      minUserInterestDistanceToContract:
        INTEREST_DISTANCE_THRESHOLDS.trending_contract,
      data,
    }
  )
}

// Currently creating feed items for:
// - New comments on contracts you follow/liked/viewed/from users you follow
// - Liked comments from likers you follow/have similar interest vectors to and
// on contracts that you've similar interest vectors to/groups you're in
// - New contracts with similar interest vector/from users you follow/you have similar interest vectors to
// - Contracts with large prob changes

// TODO:
// Create feed items from:
// - Large bets by interesting users
// Remove comment notifications
