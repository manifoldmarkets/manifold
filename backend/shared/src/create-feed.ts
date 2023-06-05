import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { Comment } from 'common/comment'
import { getUserToReasonsInterestedInContractAndUser } from 'shared/supabase/contracts'
import { Contract } from 'common/contract'
import { FEED_DATA_TYPES, FEED_REASON_TYPES } from 'common/feed'
import { Reaction } from 'common/reaction'

export const insertDataToUserFeed = async (
  userId: string,
  eventTime: number,
  dataType: FEED_DATA_TYPES,
  reason: FEED_REASON_TYPES,
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
      ['follow_contract', 'viewed_contract', 'follow_user', 'liked_contract']
    )
  await Promise.all(
    Object.keys(usersToReasonsInterestedInContract)
      .filter((userId) => !userIdsToExclude.includes(userId))
      .map((userId) =>
        insertDataToUserFeed(
          userId,
          comment.createdTime,
          'new_comment',
          usersToReasonsInterestedInContract[userId],
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
      ]
    )
  await Promise.all(
    Object.keys(usersToReasonsInterestedInContract).map((userId) =>
      insertDataToUserFeed(
        userId,
        reaction.createdTime,
        'popular_comment',
        usersToReasonsInterestedInContract[userId],
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
  reasonsToInclude: FEED_REASON_TYPES[],
  dataType: FEED_DATA_TYPES,
  options: {
    idempotencyKey?: string
    userToContractDistanceThreshold?: number
  }
) => {
  const { idempotencyKey, userToContractDistanceThreshold } = options
  const pg = createSupabaseDirectClient()
  const usersToReasonsInterestedInContract =
    await getUserToReasonsInterestedInContractAndUser(
      contract.id,
      contract.creatorId,
      pg,
      reasonsToInclude,
      userToContractDistanceThreshold
    )

  await Promise.all(
    Object.keys(usersToReasonsInterestedInContract).map((userId) =>
      insertDataToUserFeed(
        userId,
        contract.createdTime,
        dataType,
        usersToReasonsInterestedInContract[userId],
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

export const insertContractRelatedDataToUsersFeeds = async (
  contracts: {
    id: string
    creatorId: string
  }[],
  dataType: FEED_DATA_TYPES,
  reasonsToInclude: FEED_REASON_TYPES[],
  eventTime: number,
  pg: SupabaseDirectClient,
  dataProps?: {
    newsId?: string
  }
) => {
  return await Promise.all(
    contracts.map(async (contract) => {
      const usersToReasons = await getUserToReasonsInterestedInContractAndUser(
        contract.id,
        contract.creatorId,
        pg,
        reasonsToInclude
      )
      console.log(
        'found users interested in contract',
        contract.id,
        Object.keys(usersToReasons).length
      )
      return await Promise.all(
        Object.keys(usersToReasons).map(async (userId) => {
          await insertDataToUserFeed(
            userId,
            eventTime,
            dataType,
            usersToReasons[userId],
            {
              contractId: contract.id,
              creatorId: contract.creatorId,
              ...dataProps,
            },
            pg
          )
        })
      )
    })
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
// - Popular new markets
// - Large bets by interesting users
// Remove comment notifications
