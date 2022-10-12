import * as admin from 'firebase-admin'

import { getContract, getUser, log } from './utils'
import { APIError, newEndpoint, validate } from './api'
import { JSONContent } from '@tiptap/core'
import { z } from 'zod'
import { removeUndefinedProps } from '../../common/util/object'
import { htmlToRichText } from '../../common/util/parse'
import { marked } from 'marked'

const contentSchema: z.ZodType<JSONContent> = z.lazy(() =>
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
})

const MAX_COMMENT_JSON_LENGTH = 20000

// For now, only supports creating a new top-level comment on a contract.
// Replies, posts, chats are not supported yet.
export const createcomment = newEndpoint({}, async (req, auth) => {
  const firestore = admin.firestore()
  const { contractId, content, html, markdown } = validate(postSchema, req.body)

  const creator = await getUser(auth.uid)
  const contract = await getContract(contractId)

  if (!creator) {
    throw new APIError(400, 'No user exists with the authenticated user ID.')
  }
  if (!contract) {
    throw new APIError(400, 'No contract exists with the given ID.')
  }

  let contentJson = null
  if (content) {
    contentJson = content
  } else if (html) {
    console.log('html', html)
    contentJson = htmlToRichText(html)
  } else if (markdown) {
    const markedParse = marked.parse(markdown)
    log('parsed', markedParse)
    contentJson = htmlToRichText(markedParse)
    log('json', contentJson)
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

  const ref = firestore.collection(`contracts/${contractId}/comments`).doc()

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
  })

  await ref.set(comment)

  return { status: 'success', comment }
})
