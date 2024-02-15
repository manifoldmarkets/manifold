import * as admin from 'firebase-admin'
import { compact, first } from 'lodash'
import { getDomainForContract, revalidateStaticProps } from 'shared/utils'
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
import { addCommentOnContractToFeed } from 'shared/create-feed'
import { getContractsDirect } from 'shared/supabase/contracts'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import * as crypto from 'crypto'

const firestore = admin.firestore()

export const onCreateCommentOnContract = async (props: {
  contractId: string
  comment: ContractComment
  creator: User
  bet?: Bet
}) => {
  const { contractId, comment, creator, bet } = props
  const pg = createSupabaseDirectClient()

  const contracts = await getContractsDirect([contractId], pg)
  const contract = first(contracts)
  if (!contract)
    throw new Error('Could not find contract corresponding with comment')

  await revalidateStaticProps(
    contractPath(contract),
    getDomainForContract(contract)
  )

  const lastCommentTime = comment.createdTime

  await addUserToContractFollowers(contract.id, creator.id)

  await firestore
    .collection('contracts')
    .doc(contract.id)
    .update({ lastCommentTime, lastUpdatedTime: Date.now() })

  const repliedOrMentionedUserIds = await handleCommentNotifications(
    pg,
    comment,
    contract,
    creator,
    bet
  )
  await addCommentOnContractToFeed(
    contract,
    comment,
    repliedOrMentionedUserIds.concat([contract.creatorId, comment.userId])
  )
}

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
      `select comment_id, user_id
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
      `select comment_id, user_id, data->>'replyToCommentId' as reply_to_id
      from contract_comments where contract_id = $1`,
      [contract.id]
    )
    return {
      repliedToAnswer: null,
      repliedToType: 'comment',
      repliedUserId: comments.find(
        (c) => c.comment_id === comment.replyToCommentId
      )?.user_id,
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
  bet: Bet | undefined
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
    crypto.randomUUID(),
    richTextToString(comment.content),
    contract,
    {
      repliedUsersInfo: repliedUsers,
      taggedUserIds: mentionedUsers,
    }
  )
  return [...mentionedUsers, ...Object.keys(repliedUsers)]
}
