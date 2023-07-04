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

const findDuplicateContractsInFeed = async (
  contractId: string,
  userId: string,
  seenTime: number,
  pg: SupabaseDirectClient
) => {
  const rowIds = await pg.manyOrNone<{
    id: string
    seen_time: Date | null
  }>(
    `select id, seen_time from user_feed 
          where contract_id = $1 and 
                user_id = $2 and 
                created_time > $3
                `,
    [contractId, userId, new Date(seenTime).toISOString()]
  )
  return rowIds.map((row) => ({
    id: parseInt(row.id),
    seenTime: row.seen_time ? new Date(row.seen_time) : null,
  }))
}

const deleteRowsFromUserFeed = async (
  rowIds: number[],
  pg: SupabaseDirectClient
) => {
  if (rowIds.length === 0) return
  await pg.none(`delete from user_feed where id = any($1)`, [rowIds])
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
      [
        'follow_contract',
        'follow_user',
        'liked_contract',
        'similar_interest_vector_to_contract',
      ],
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
    maxDistanceFromUserInterestToContract: number
    userIdResponsibleForEvent?: string
    idempotencyKey?: string
  }
) => {
  const {
    idempotencyKey,
    maxDistanceFromUserInterestToContract,
    userIdResponsibleForEvent,
  } = options
  const pg = createSupabaseDirectClient()
  const usersToReasonsInterestedInContract =
    await getUserToReasonsInterestedInContractAndUser(
      contract.id,
      userIdResponsibleForEvent ?? contract.creatorId,
      pg,
      reasonsToInclude,
      maxDistanceFromUserInterestToContract
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
  log(
    `Added contract ${contract.id} to feed of ${
      Object.keys(usersToReasonsInterestedInContract).length
    } users`
  )
}
export const addContractToFeedIfUnseenAndDeleteDuplicates = async (
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
      contract.id,
      contract.creatorId,
      pg,
      reasonsToInclude,
      minUserInterestDistanceToContract
    )
  const userIds = Object.keys(usersToReasonsInterestedInContract)
  await Promise.all(
    userIds.map(async (userId) => {
      const previousContractFeedRows = await findDuplicateContractsInFeed(
        contract.id,
        userId,
        unseenNewerThanTime,
        pg
      )
      const seenContractFeedRows = previousContractFeedRows.filter(
        (row) => row.seenTime !== null
      )

      // If they've a duplicate row they've already seen, don't insert
      if (seenContractFeedRows.length > 0) return
      await deleteRowsFromUserFeed(
        previousContractFeedRows.map((row) => row.id),
        pg
      )
      return await insertDataToUserFeed(
        userId,
        contract.createdTime,
        dataType,
        usersToReasonsInterestedInContract[userId],
        userIdsToExclude,
        {
          contractId: contract.id,
          creatorId: contract.creatorId,
          data,
        },
        pg
      )
    })
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
  //TODO: Turn this into a select query, remove the idempotency key, add to top of feed
  //  as in trending contracts
  const idempotencyKey = `${
    contract.id
  }-prob-change-${nowDate.getFullYear()}-${nowDate.getMonth()}-${nowDate.getDate()}`
  await addContractToFeed(
    contract,
    buildArray([
      // TODO: We have these in our notifs, but might be nice in the feed
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
    }
  )
}
export const insertTrendingContractToUsersFeeds = async (
  contract: Contract,
  unseenNewerThanTime: number,
  data?: Record<string, any>
) => {
  await addContractToFeedIfUnseenAndDeleteDuplicates(
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
