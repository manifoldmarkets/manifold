import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { compact, first } from 'lodash'
import { getUser, revalidateStaticProps } from 'shared/utils'
import { ContractComment } from 'common/comment'
import { Bet } from 'common/bet'
import {
  createCommentOrAnswerOrUpdatedContractNotification,
  replied_users_info,
} from 'shared/create-notification'
import { parseMentions, richTextToString } from 'common/util/parse'
import { addUserToContractFollowers } from 'shared/follow-market'
import { Contract, contractPath } from 'common/contract'
import { User } from 'common/user'
import { secrets } from 'common/secrets'

import { removeUndefinedProps } from 'common/util/object'
import { addCommentOnContractToFeed } from 'shared/create-feed'
import { getContractsDirect } from 'shared/supabase/contracts'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'

const firestore = admin.firestore()

async function getMostRecentCommentableBet(
  pg: SupabaseDirectClient,
  contractId: string,
  userId: string,
  commentCreatedTime: number,
  answerOutcome?: string
) {
  return await pg.oneOrNone(
    `with prior_user_comments_with_bets as (
      select created_time, data->>'betId' as bet_id from contract_comments
      where contract_id = $1 and user_id = $2
      and created_time < millis_to_ts($3)
      and data ->> 'betId' is not null
    ), prior_user_bets as (
      select * from contract_bets
      where contract_id = $1 and user_id = $2
      and created_time < millis_to_ts($3)
      and not is_ante
    ), cutoff_time as (
      select *
      from (
        select created_time from prior_user_comments_with_bets
        union all
        select (millis_to_ts($3) - interval '5 minutes') as created_time
      ) as t
      order by created_time desc
      limit 1
    )
    select id, outcome, answer_id, amount
    from prior_user_bets as b
    where not b.is_redemption
    and $4 is null or b.id = $4
    and b.created_time > (select created_time from cutoff_time)
    and b.bet_id not in (select bet_id from prior_user_comments_with_bets)
    order by created_time desc
    limit 1`,
    [contractId, userId, commentCreatedTime, answerOutcome]
  )
}

export const onCreateCommentOnContract = functions
  .runWith({ memory: '4GB', timeoutSeconds: 540, secrets })
  .firestore.document('contracts/{contractId}/comments/{commentId}')
  .onCreate(async (change, context) => {
    const { contractId } = context.params as {
      contractId: string
    }
    const { eventId } = context
    const pg = createSupabaseDirectClient()

    const contracts = await getContractsDirect([contractId], pg)
    const contract = first(contracts)
    if (!contract)
      throw new Error('Could not find contract corresponding with comment')

    await revalidateStaticProps(contractPath(contract))

    const comment = change.data() as ContractComment
    const lastCommentTime = comment.createdTime

    const commentCreator = await getUser(comment.userId)
    if (!commentCreator) throw new Error('Could not find comment creator')

    await addUserToContractFollowers(contract.id, commentCreator.id)

    await firestore
      .collection('contracts')
      .doc(contract.id)
      .update({ lastCommentTime, lastUpdatedTime: Date.now() })

    let bet: Bet | undefined
    if (!comment.betId) {
      const bet = await getMostRecentCommentableBet(
        pg,
        contract.id,
        comment.userId,
        comment.createdTime,
        comment.answerOutcome
      )
      if (bet) {
        const { id, outcome, amount, answer_id } = bet
        await change.ref.update(
          removeUndefinedProps({
            betId: id,
            betOutcome: outcome,
            betAmount: amount,
            betAnswerId: answer_id,
          })
        )
      }
    }

    const position = await getLargestPosition(pg, contract.id, comment.userId)
    if (position && position.shares >= 1) {
      const fields: { [k: string]: unknown } = {
        commenterPositionShares: position.shares,
        commenterPositionOutcome: position.outcome,
      }
      if (position.answer_id) {
        fields.commenterPositionAnswerId = position.answer_id
      }
      if (contract.mechanism === 'cpmm-1') {
        fields.commenterPositionProb = contract.prob
      }
      await change.ref.update(fields)
    }

    const repliedOrMentionedUserIds = await handleCommentNotifications(
      pg,
      comment,
      contract,
      commentCreator,
      bet,
      eventId
    )
    await addCommentOnContractToFeed(
      contract,
      comment,
      repliedOrMentionedUserIds.concat([contract.creatorId, comment.userId]),
      eventId
    )
  })

const getReplyInfo = async (
  pg: SupabaseDirectClient,
  comment: ContractComment,
  contract: Contract
) => {
  if (
    comment.answerOutcome &&
    contract.outcomeType === 'FREE_RESPONSE' &&
    contract.answers
  ) {
    const answer = contract.answers.find((a) => a.id === comment.answerOutcome)
    const comments = await pg.manyOrNone(
      `select id, user_id
      from contract_comments
      where contract_id = $1 and coalesce(data->>'answerOutcome', '') = $2`,
      [contract.id, answer?.id ?? '']
    )
    return {
      repliedToAnswer: answer,
      repliedToType: 'answer',
      repliedUserId: answer?.userId,
      commentsInSameReplyChain: comments,
    } as const
  } else if (comment.replyToCommentId) {
    const comments = await pg.manyOrNone(
      `select id, user_id, data->>'replyToCommentId' as reply_to_id
      from contract_comments where contract_id = $1`,
      [contract.id]
    )
    return {
      repliedToAnswer: null,
      repliedToType: 'comment',
      repliedUserId: comments.find((c) => c.id === comment.replyToCommentId)
        ?.user_id,
      commentsInSameReplyChain: comments.filter(
        (c) => c.reply_to_id === comment.replyToCommentId
      ),
    } as const
  } else {
    return null
  }
}

export const handleCommentNotifications = async (
  pg: SupabaseDirectClient,
  comment: ContractComment,
  contract: Contract,
  commentCreator: User,
  bet: Bet | undefined,
  eventId: string
) => {
  const replyInfo = await getReplyInfo(pg, comment, contract)

  const mentionedUsers = compact(parseMentions(comment.content))
  const repliedUsers: replied_users_info = {}
  if (replyInfo) {
    const {
      repliedToType,
      repliedUserId,
      repliedToAnswer,
      commentsInSameReplyChain,
    } = replyInfo

    // The parent of the reply chain could be a comment or an answer
    if (repliedUserId && repliedToType)
      repliedUsers[repliedUserId] = {
        repliedToType,
        repliedToAnswerText: repliedToAnswer?.text,
        repliedToId: comment.replyToCommentId || repliedToAnswer?.id,
        bet: bet,
      }

    if (commentsInSameReplyChain) {
      // The rest of the children in the chain are always comments
      commentsInSameReplyChain.forEach((c) => {
        if (c.user_id !== comment.userId && c.user_id !== repliedUserId) {
          repliedUsers[c.userId] = {
            repliedToType: 'comment',
            repliedToAnswerText: undefined,
            repliedToId: c.id,
            bet: undefined,
          }
        }
      })
    }
  }

  await createCommentOrAnswerOrUpdatedContractNotification(
    comment.id,
    'comment',
    'created',
    commentCreator,
    eventId,
    richTextToString(comment.content),
    contract,
    {
      repliedUsersInfo: repliedUsers,
      taggedUserIds: mentionedUsers,
    }
  )
  return [...mentionedUsers, ...Object.keys(repliedUsers)]
}

async function getLargestPosition(
  pg: SupabaseDirectClient,
  contractId: string,
  userId: string
) {
  // mqp: should probably use user_contract_metrics for this, i am just lazily porting
  return await pg.oneOrNone(
    `with user_positions as (
      select answer_id, outcome, sum(shares) as shares
      from contract_bets
      where contract_id = $1
      and user_id = $2
      group by answer_id, outcome
    )
    select * from user_positions order by shares desc limit 1`,
    [contractId, userId]
  )
}
