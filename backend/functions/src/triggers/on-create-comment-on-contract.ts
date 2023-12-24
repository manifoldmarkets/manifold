import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { compact, first } from 'lodash'
import { getUser, getValues, revalidateStaticProps } from 'shared/utils'
import { ContractComment } from 'common/comment'
import { Bet } from 'common/bet'
import { getLargestPosition } from 'common/calculate'
import {
  createCommentOrAnswerOrUpdatedContractNotification,
  replied_users_info,
} from 'shared/create-notification'
import { parseMentions, richTextToString } from 'common/util/parse'
import { addUserToContractFollowers } from 'shared/follow-market'
import { Contract, contractPath } from 'common/contract'
import { User } from 'common/user'
import { secrets } from 'common/secrets'
import { HOUR_MS } from 'common/util/time'
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
        select (millis_to_ts($3) - interval '1 hour') as created_time
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

export async function getPriorContractBets(
  contractId: string,
  userId: string,
  before: number
) {
  const priorBetsQuery = await firestore
    .collection('contracts')
    .doc(contractId)
    .collection('bets')
    .where('createdTime', '<', before)
    .where('userId', '==', userId)
    .where('isAnte', '==', false)
    .get()
  return priorBetsQuery.docs.map((d) => d.data() as Bet)
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

    const priorUserBets = await getPriorContractBets(
      contractId,
      comment.userId,
      comment.createdTime
    )

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

    const position = getLargestPosition(contract, priorUserBets)
    if (position) {
      const fields: { [k: string]: unknown } = {
        commenterPositionShares: position.shares,
        commenterPositionOutcome: position.outcome,
      }
      if (position.answerId) {
        fields.commenterPositionAnswerId = position.answerId
      }
      if (contract.mechanism === 'cpmm-1') {
        fields.commenterPositionProb = contract.prob
      }
      await change.ref.update(fields)
    }

    const repliedOrMentionedUserIds = await handleCommentNotifications(
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

const getReplyInfo = async (comment: ContractComment, contract: Contract) => {
  if (
    comment.answerOutcome &&
    contract.outcomeType === 'FREE_RESPONSE' &&
    contract.answers
  ) {
    const comments = await getValues<ContractComment>(
      firestore.collection('contracts').doc(contract.id).collection('comments')
    )
    const answer = contract.answers.find((a) => a.id === comment.answerOutcome)
    return {
      repliedToAnswer: answer,
      repliedToType: 'answer',
      repliedUserId: answer?.userId,
      commentsInSameReplyChain: comments.filter(
        (c) => c.answerOutcome === answer?.id
      ),
    } as const
  } else if (comment.replyToCommentId) {
    const comments = await getValues<ContractComment>(
      firestore.collection('contracts').doc(contract.id).collection('comments')
    )
    return {
      repliedToAnswer: null,
      repliedToType: 'comment',
      repliedUserId: comments.find((c) => c.id === comment.replyToCommentId)
        ?.userId,
      commentsInSameReplyChain: comments.filter(
        (c) => c.replyToCommentId === comment.replyToCommentId
      ),
    } as const
  } else {
    return null
  }
}

export const handleCommentNotifications = async (
  comment: ContractComment,
  contract: Contract,
  commentCreator: User,
  bet: Bet | undefined,
  eventId: string
) => {
  const replyInfo = await getReplyInfo(comment, contract)

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
        if (c.userId !== comment.userId && c.userId !== repliedUserId) {
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
