import * as admin from 'firebase-admin'

import { getContract, getUser, htmlToRichText } from 'shared/utils'
import { APIError, authEndpoint, validate } from './helpers'
import { JSONContent } from '@tiptap/core'
import { string, z } from 'zod'
import { removeUndefinedProps } from 'common/util/object'
import { marked } from 'marked'
import { Comment } from 'common/comment'
import { Bet } from 'common/bet'

export const contentSchema: z.ZodType<JSONContent> = z.lazy(() =>
  z.intersection(
    z.record(z.any()),
    z.object({
      type: z.string().optional(),
      attrs: z.record(z.any()).optional(),
      content: z.array(contentSchema).optional(),
      marks: z
        .array(
          z.intersection(
            z.record(z.any()),
            z.object({
              type: z.string(),
              attrs: z.record(z.any()).optional(),
            })
          )
        )
        .optional(),
      text: z.string().optional(),
    })
  )
)

const postSchema = z.object({
  contractId: z.string(),
  content: contentSchema.optional(),
  html: z.string().optional(),
  markdown: z.string().optional(),
  replyToCommentId: z.string().optional(),
  replyToAnswerId: z.string().optional(),
  replyToBetId: z.string().optional(),
})

export const MAX_COMMENT_JSON_LENGTH = 20000

// For now, only supports creating a new top-level comment on a contract.
// Replies, posts, chats are not supported yet.
export const createcomment = authEndpoint(async (req, auth) => {
  const firestore = admin.firestore()
  const {
    contractId,
    content,
    html,
    markdown,
    replyToCommentId,
    replyToAnswerId,
    replyToBetId,
  } = validate(postSchema, req.body)

  const { creator, contract, contentJson } = await validateComment(
    contractId,
    auth.uid,
    content,
    html,
    markdown
  )

  const ref = firestore.collection(`contracts/${contractId}/comments`).doc()
  const bet = replyToBetId
    ? await firestore
        .collection(`contracts/${contract.id}/bets`)
        .doc(replyToBetId)
        .get()
        .then((doc) => doc.data() as Bet)
    : undefined

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
    bettorName: bet?.userName,
    bettorUsername: bet?.userUsername,
  } as Comment)

  await ref.set(comment)

  return { status: 'success', comment }
})

export const validateComment = async (
  contractId: string,
  userId: string,
  content: JSONContent | undefined,
  html: string | undefined,
  markdown: string | undefined
) => {
  const creator = await getUser(userId)
  const contract = await getContract(contractId)

  if (!creator)
    throw new APIError(400, 'No user exists with the authenticated user ID.')
  if (creator.isBannedFromPosting)
    throw new APIError(400, 'User banned from commented.')

  if (!contract)
    throw new APIError(400, 'No contract exists with the given ID.')

  let contentJson = null
  if (content) {
    contentJson = content
  } else if (html) {
    contentJson = htmlToRichText(html)
  } else if (markdown) {
    const markedParse = marked.parse(markdown)
    contentJson = htmlToRichText(markedParse)
  }

  if (!contentJson) {
    throw new APIError(400, 'No comment content provided.')
  }

  if (JSON.stringify(contentJson).length > MAX_COMMENT_JSON_LENGTH) {
    throw new APIError(
      400,
      `Comment is too long; should be less than ${MAX_COMMENT_JSON_LENGTH} as a JSON string.`
    )
  }
  return { contentJson, creator, contract }
}
