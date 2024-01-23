import * as admin from 'firebase-admin'
import { JSONContent } from '@tiptap/core'
import { ContractComment } from 'common/comment'
import { Bet } from 'common/bet'
import { FieldValue } from 'firebase-admin/firestore'
import { FLAT_COMMENT_FEE } from 'common/fees'
import { removeUndefinedProps } from 'common/util/object'
import { getContract, getUserFirebase } from 'shared/utils'
import { APIError, AuthedUser, type APIHandler } from './helpers/endpoint'
import { anythingToRichText } from 'shared/tiptap'

export const MAX_COMMENT_JSON_LENGTH = 20000

// For now, only supports creating a new top-level comment on a contract.
// Replies, posts, chats are not supported yet.
export const createComment: APIHandler<'comment'> = async (props, auth) => {
  const {
    contractId,
    content,
    html,
    markdown,
    replyToCommentId,
    replyToAnswerId,
    replyToBetId,
  } = props
  return createCommentOnContractInternal(contractId, auth, {
    content,
    html,
    markdown,
    replyToCommentId,
    replyToAnswerId,
    replyToBetId,
  })
}

export const createCommentOnContractInternal = async (
  contractId: string,
  auth: AuthedUser,
  options: {
    content: JSONContent | undefined
    html?: string
    markdown?: string
    replyToCommentId?: string
    replyToAnswerId?: string
    replyToBetId?: string
    isRepost?: boolean
  }
) => {
  const firestore = admin.firestore()
  const {
    content,
    html,
    markdown,
    replyToCommentId,
    replyToAnswerId,
    replyToBetId,
    isRepost,
  } = options

  const {
    you: creator,
    contract,
    contentJson,
  } = await validateComment(contractId, auth.uid, content, html, markdown)

  const ref = firestore.collection(`contracts/${contractId}/comments`).doc()
  const bet = replyToBetId
    ? await firestore
        .collection(`contracts/${contract.id}/bets`)
        .doc(replyToBetId)
        .get()
        .then((doc) => doc.data() as Bet)
    : undefined

  const isApi = auth.creds.kind === 'key'

  const comment = removeUndefinedProps({
    id: ref.id,
    content: contentJson,
    createdTime: Date.now(),

    userId: creator.id,
    userName: creator.name,
    userUsername: creator.username,
    userAvatarUrl: creator.avatarUrl,

    // OnContract fields
    commentType: 'contract',
    contractId: contractId,
    contractSlug: contract.slug,
    contractQuestion: contract.question,
    replyToCommentId: replyToCommentId,
    answerOutcome: replyToAnswerId,
    visibility: contract.visibility,

    // Response to another user's bet fields
    betId: bet?.id,
    betAmount: bet?.amount,
    betOutcome: bet?.outcome,
    betAnswerId: bet?.answerId,
    bettorName: bet?.userName,
    bettorUsername: bet?.userUsername,
    betOrderAmount: bet?.orderAmount,
    betLimitProb: bet?.limitProb,
    isApi,
    isRepost,
  } as ContractComment)

  await ref.set(comment)

  if (isApi) {
    const userRef = firestore.doc(`users/${creator.id}`)
    await userRef.update({
      balance: FieldValue.increment(-FLAT_COMMENT_FEE),
      totalDeposits: FieldValue.increment(-FLAT_COMMENT_FEE),
    })
  }

  return comment
}

export const validateComment = async (
  contractId: string,
  userId: string,
  content: JSONContent | undefined,
  html: string | undefined,
  markdown: string | undefined
) => {
  const you = await getUserFirebase(userId)
  const contract = await getContract(contractId)

  if (!you) throw new APIError(401, 'Your account was not found')
  if (you.isBannedFromPosting) throw new APIError(403, 'You are banned')

  if (!contract) throw new APIError(404, 'Contract not found')

  const contentJson = content || anythingToRichText({ html, markdown })

  if (!contentJson) {
    throw new APIError(400, 'No comment content provided.')
  }

  if (JSON.stringify(contentJson).length > MAX_COMMENT_JSON_LENGTH) {
    throw new APIError(
      400,
      `Comment is too long; should be less than ${MAX_COMMENT_JSON_LENGTH} as a JSON string.`
    )
  }
  return { contentJson, you, contract }
}
