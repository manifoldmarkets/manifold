import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { compact } from 'lodash'
import {
  getContract,
  getContractPath,
  getUser,
  getValues,
  revalidateStaticProps,
} from './utils'
import { ContractComment } from '../../common/comment'
import { Bet } from '../../common/bet'
import { Answer } from '../../common/answer'
import { getLargestPosition } from '../../common/calculate'
import { maxBy } from 'lodash'
import {
  createCommentOrAnswerOrUpdatedContractNotification,
  replied_users_info,
} from './create-notification'
import { parseMentions, richTextToString } from '../../common/util/parse'
import { addUserToContractFollowers } from './follow-market'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { BOT_USERNAMES } from 'common/envs/constants'

const firestore = admin.firestore()

function getMostRecentCommentableBet(
  before: number,
  betsByCurrentUser: Bet[],
  commentsByCurrentUser: ContractComment[],
  answerOutcome?: string
) {
  let sortedBetsByCurrentUser = betsByCurrentUser.sort(
    (a, b) => b.createdTime - a.createdTime
  )
  if (answerOutcome) {
    sortedBetsByCurrentUser = sortedBetsByCurrentUser.slice(0, 1)
  }
  return sortedBetsByCurrentUser
    .filter((bet) => {
      const { createdTime, isRedemption } = bet
      // You can comment on bets posted in the last hour
      const commentable = !isRedemption && before - createdTime < 60 * 60 * 1000
      const alreadyCommented = commentsByCurrentUser.some(
        (comment) => comment.createdTime > bet.createdTime
      )
      if (commentable && !alreadyCommented) {
        if (!answerOutcome) return true
        return answerOutcome === bet.outcome
      }
      return false
    })
    .pop()
}

async function getPriorUserComments(
  contractId: string,
  userId: string,
  before: number
) {
  const priorCommentsQuery = await firestore
    .collection('contracts')
    .doc(contractId)
    .collection('comments')
    .where('createdTime', '<', before)
    .where('userId', '==', userId)
    .get()
  return priorCommentsQuery.docs.map((d) => d.data() as ContractComment)
}

async function getPriorContractBets(contractId: string, before: number) {
  const priorBetsQuery = await firestore
    .collection('contracts')
    .doc(contractId)
    .collection('bets')
    .where('createdTime', '<', before)
    .get()
  return priorBetsQuery.docs.map((d) => d.data() as Bet)
}

export const onCreateCommentOnContract = functions
  .runWith({ secrets: ['MAILGUN_KEY'] })
  .firestore.document('contracts/{contractId}/comments/{commentId}')
  .onCreate(async (change, context) => {
    const { contractId } = context.params as {
      contractId: string
    }
    const { eventId } = context

    const contract = await getContract(contractId)
    if (!contract)
      throw new Error('Could not find contract corresponding with comment')

    await change.ref.update({
      contractSlug: contract.slug,
      contractQuestion: contract.question,
    })

    await revalidateStaticProps(getContractPath(contract))

    const comment = change.data() as ContractComment
    const lastCommentTime = comment.createdTime

    const commentCreator = await getUser(comment.userId)
    if (!commentCreator) throw new Error('Could not find comment creator')

    await addUserToContractFollowers(contract.id, commentCreator.id)

    await firestore
      .collection('contracts')
      .doc(contract.id)
      .update({ lastCommentTime, lastUpdatedTime: Date.now() })

    const priorBets = await getPriorContractBets(
      contractId,
      comment.createdTime
    )
    const priorUserBets = priorBets.filter(
      (b) => b.userId === comment.userId && !b.isAnte
    )
    const priorUserComments = await getPriorUserComments(
      contractId,
      comment.userId,
      comment.createdTime
    )
    const bet = getMostRecentCommentableBet(
      comment.createdTime,
      priorUserBets,
      priorUserComments,
      comment.answerOutcome
    )
    if (bet) {
      await change.ref.update({
        betId: bet.id,
        betOutcome: bet.outcome,
        betAmount: bet.amount,
      })
    }

    const position = getLargestPosition(contract, priorUserBets)
    if (position) {
      const fields: { [k: string]: unknown } = {
        commenterPositionShares: position.shares,
        commenterPositionOutcome: position.outcome,
      }
      const previousProb =
        contract.outcomeType === 'BINARY'
          ? maxBy(priorBets, (bet) => bet.createdTime)?.probAfter
          : undefined
      if (previousProb != null) {
        fields.commenterPositionProb = previousProb
      }
      await change.ref.update(fields)
    }

    if (!BOT_USERNAMES.includes(commentCreator.username)) {
      await handleCommentNotifications(
        comment,
        contract,
        commentCreator,
        bet,
        eventId
      )
    }
  })

const handleCommentNotifications = async (
  comment: ContractComment,
  contract: Contract,
  commentCreator: User,
  bet: Bet | undefined,
  eventId: string
) => {
  let answer: Answer | undefined
  if (comment.answerOutcome) {
    answer =
      contract.outcomeType === 'FREE_RESPONSE' && contract.answers
        ? contract.answers?.find(
            (answer) => answer.id === comment.answerOutcome
          )
        : undefined
  }

  const comments = await getValues<ContractComment>(
    firestore.collection('contracts').doc(contract.id).collection('comments')
  )
  const repliedToType = answer
    ? 'answer'
    : comment.replyToCommentId
    ? 'comment'
    : undefined

  const repliedUserId = comment.replyToCommentId
    ? comments.find((c) => c.id === comment.replyToCommentId)?.userId
    : answer?.userId

  const mentionedUsers = compact(parseMentions(comment.content))
  const repliedUsers: replied_users_info = {}

  // The parent of the reply chain could be a comment or an answer
  if (repliedUserId && repliedToType)
    repliedUsers[repliedUserId] = {
      repliedToType,
      repliedToAnswerText: answer ? answer.text : undefined,
      repliedToId: comment.replyToCommentId || answer?.id,
      bet: bet,
    }

  const commentsInSameReplyChain = comments.filter((c) =>
    repliedToType === 'answer'
      ? c.answerOutcome === answer?.id
      : repliedToType === 'comment'
      ? c.replyToCommentId === comment.replyToCommentId
      : false
  )
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
}
