import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { Comment } from 'common/comment'
import { getUserIdsInterestedInContract } from 'shared/supabase/contracts'
import { Contract } from 'common/contract'

const insertDataToUserFeed = async (
  userId: string,
  eventTime: number,
  dataType: 'comment' | 'answer' | 'bet' | 'news' | 'contract',
  reason: string,
  dataProps: {
    contractId?: string
    commentId?: string
    answerId?: string
    creatorId?: string
    betId?: string
    newsId?: string
    data?: any
    groupId?: string
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
  } = dataProps
  await pg.none(
    `insert into user_feed 
    (user_id, data_type, reason, contract_id, comment_id, answer_id, creator_id, bet_id, news_id, group_id, event_time, data)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
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
    ]
  )
}

export const addCommentOnContractToFeed = async (
  contractId: string,
  comment: Comment
) => {
  const pg = createSupabaseDirectClient()
  const userIdsInterestedInContract = await getUserIdsInterestedInContract(
    contractId,
    comment.userId,
    pg
  )
  await Promise.all(
    userIdsInterestedInContract.map((userId) =>
      insertDataToUserFeed(
        userId,
        comment.createdTime,
        'comment',
        'new comment',
        {
          contractId,
          commentId: comment.id,
          creatorId: comment.userId,
        },
        pg
      )
    )
  )
}

export const addContractToFeed = async (contract: Contract) => {
  const pg = createSupabaseDirectClient()
  const userIdsInterestedInContract = await getUserIdsInterestedInContract(
    contract.id,
    contract.creatorId,
    pg
  )

  await Promise.all(
    userIdsInterestedInContract.map((userId) =>
      insertDataToUserFeed(
        userId,
        contract.createdTime,
        'contract',
        'new contract',
        {
          contractId: contract.id,
          creatorId: contract.creatorId,
        },
        pg
      )
    )
  )
}

// TODO: create feed items from:
// - Large probabilitiy changes
// - Large bets by interesting users
// - News articles
