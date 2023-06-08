import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { Comment } from 'common/comment'
import { getUserToReasonsInterestedInContractAndUser } from 'shared/supabase/contracts'
import { Contract } from 'common/contract'
import {
  CONTRACT_OR_USER_FEED_REASON_TYPES,
  FEED_DATA_TYPES,
  FEED_REASON_TYPES,
  INTEREST_DISTANCE_THRESHOLDS,
} from 'common/feed'
import { Reaction } from 'common/reaction'
import { log } from 'shared/utils'
import { buildArray } from 'common/util/array'
import { getUsersWithSimilarInterestVectorToNews } from 'shared/supabase/users'

export const insertDataToUserFeed = async (
  userId: string,
  eventTime: number,
  dataType: FEED_DATA_TYPES,
  reason: FEED_REASON_TYPES,
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
  if (userIdsToExclude.includes(userId)) return
  const eventTimeTz = new Date(eventTime).toISOString()
  const {
    groupId,
    contractId,
    commentId,
    answerId,
    creatorId,
    betId,
    newsId,
    data,
    reactionId,
    idempotencyKey,
  } = dataProps
  await pg.none(
    `insert into user_feed 
    (user_id, data_type, reason, contract_id, comment_id, answer_id, creator_id, bet_id, news_id, group_id, event_time, data, reaction_id, idempotency_key)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) 
    on conflict do nothing`,
    [
      userId,
      dataType,
      reason,
      contractId,
      commentId,
      answerId,
      creatorId,
      betId,
      newsId,
      groupId,
      eventTimeTz,
      data,
      reactionId,
      idempotencyKey,
    ]
  )
}

export const addCommentOnContractToFeed = async (
  contractId: string,
  comment: Comment,
  userIdsToExclude: string[],
  idempotencyKey?: string
) => {
  const pg = createSupabaseDirectClient()
  const usersToReasonsInterestedInContract =
    await getUserToReasonsInterestedInContractAndUser(
      contractId,
      comment.userId,
      pg,
      ['follow_contract', 'viewed_contract', 'follow_user', 'liked_contract'],
      INTEREST_DISTANCE_THRESHOLDS.new_comment
    )
  await Promise.all(
    Object.keys(usersToReasonsInterestedInContract).map(async (userId) =>
      insertDataToUserFeed(
        userId,
        comment.createdTime,
        'new_comment',
        usersToReasonsInterestedInContract[userId],
        userIdsToExclude,
        {
          contractId,
          commentId: comment.id,
          creatorId: comment.userId,
          idempotencyKey,
        },
        pg
      )
    )
  )
}
//TODO: before adding, exclude those users who:
// - have it in their notifications: users in reply thread, mentioned, creator of the contract
// - creator of the comment & reaction
// - have already seen the comment
// - already have the comment in their feed (unique by contract id, comment id, user id)
export const addLikedCommentOnContractToFeed = async (
  contractId: string,
  reaction: Reaction,
  comment: Comment,
  userIdsToExclude: string[],
  idempotencyKey?: string
) => {
  const pg = createSupabaseDirectClient()
  const usersToReasonsInterestedInContract =
    await getUserToReasonsInterestedInContractAndUser(
      contractId,
      reaction.userId,
      pg,
      [
        'follow_user',
        'similar_interest_vector_to_user',
        'contract_in_group_you_are_in',
        'similar_interest_vector_to_contract',
      ],
      INTEREST_DISTANCE_THRESHOLDS.popular_comment
    )
  await Promise.all(
    Object.keys(usersToReasonsInterestedInContract).map(async (userId) =>
      insertDataToUserFeed(
        userId,
        reaction.createdTime,
        'popular_comment',
        usersToReasonsInterestedInContract[userId],
        userIdsToExclude,
        {
          contractId,
          commentId: comment.id,
          creatorId: reaction.userId,
          reactionId: reaction.id,
          idempotencyKey,
        },
        pg
      )
    )
  )
}

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
    minUserInterestDistanceToContract: number
    userIdResponsibleForEvent?: string
    idempotencyKey?: string
  }
) => {
  const {
    idempotencyKey,
    minUserInterestDistanceToContract,
    userIdResponsibleForEvent,
  } = options
  const pg = createSupabaseDirectClient()
  const usersToReasonsInterestedInContract =
    await getUserToReasonsInterestedInContractAndUser(
      contract.id,
      userIdResponsibleForEvent ?? contract.creatorId,
      pg,
      reasonsToInclude,
      minUserInterestDistanceToContract
    )

  await Promise.all(
    Object.keys(usersToReasonsInterestedInContract).map(async (userId) =>
      insertDataToUserFeed(
        userId,
        contract.createdTime,
        dataType,
        usersToReasonsInterestedInContract[userId],
        userIdsToExclude,
        {
          contractId: contract.id,
          creatorId: contract.creatorId,
          idempotencyKey,
        },
        pg
      )
    )
  )
}

export const insertNewsContractsToUsersFeeds = async (
  newsId: string,
  contracts: {
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
  return await Promise.all(
    Object.keys(usersToReasons).map(async (userId) => {
      return await Promise.all(
        contracts.map(async (contract) => {
          await insertDataToUserFeed(
            userId,
            eventTime,
            'news_with_related_contracts',
            usersToReasons[userId],
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
    })
  )
}
export const insertMarketMovementContractToUsersFeeds = async (
  contract: Contract,
  dailyScore: number
) => {
  log(
    'adding contract to feed',
    contract.id,
    'with daily score',
    dailyScore,
    'prev score',
    contract.dailyScore
  )
  const nowDate = new Date()
  // Prevent same contract from being added to feed multiple times in a day
  // TODO: Should we turn this into a select query and remove the idempotency key?
  const idempotencyKey = `${
    contract.id
  }-prob-change-${nowDate.getFullYear()}-${nowDate.getMonth()}-${nowDate.getDate()}`
  await addContractToFeed(
    contract,
    buildArray([
      // You'll see it in your notifs
      !contract.isResolved && 'follow_contract',
      // TODO: viewed might not be signal enough, what about viewed 2x/3x?
      'viewed_contract',
      'liked_contract',
      'similar_interest_vector_to_contract',
    ]),
    'contract_probability_changed',
    [],
    {
      minUserInterestDistanceToContract:
        INTEREST_DISTANCE_THRESHOLDS.contract_probability_changed,
      idempotencyKey,
    }
  )
}
export const insertTrendingContractToUsersFeeds = async (
  contract: Contract,
  popularityScore: number
) => {
  log(
    'adding contract to feed',
    contract.id,
    'with popularity score',
    popularityScore,
    'prev score',
    contract.popularityScore
  )
  const nowDate = new Date()
  // Prevent same contract from being added to feed multiple times in a day
  // TODO: Should we turn this into a select query and remove the idempotency key?
  const idempotencyKey = `${
    contract.id
  }-popularity-score-change-${nowDate.getFullYear()}-${nowDate.getMonth()}-${nowDate.getDate()}`
  await addContractToFeed(
    contract,
    buildArray([
      'follow_contract',
      'viewed_contract',
      'liked_contract',
      'similar_interest_vector_to_contract',
    ]),
    'trending_contract',
    [],
    {
      minUserInterestDistanceToContract:
        INTEREST_DISTANCE_THRESHOLDS.trending_contract,
      idempotencyKey,
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
// - large subsidies
// Remove comment notifications
