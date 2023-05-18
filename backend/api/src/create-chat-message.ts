import { z } from 'zod'
import { JSONContent } from '@tiptap/core'
import { APIError, authEndpoint, validate } from 'api/helpers'
import * as admin from 'firebase-admin'
import { removeUndefinedProps } from 'common/util/object'
import { getUser } from 'shared/utils'
import { ChatMessage } from 'common/chat-message'
import { createSupabaseClient } from 'shared/supabase/init'
import { Json } from 'common/supabase/schema'

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
  content: contentSchema.optional(),
  channelId: z.string(),
}).strict()

export const MAX_COMMENT_JSON_LENGTH = 20000

// For now, only supports creating a new top-level comment on a contract.
// Replies, posts, chats are not supported yet.
export const createchatmessage = authEndpoint(async (req, auth) => {
  const firestore = admin.firestore()
  const { content, channelId } = validate(postSchema, req.body)

  const creator = await getUser(auth.uid)
  if (!creator)
    throw new APIError(400, 'No user exists with the authenticated user ID.')
  if (creator.isBannedFromPosting)
    throw new APIError(400, 'User banned from chat.')

  const chatMessage = removeUndefinedProps({
    content: content as Json,
    channel_id: channelId,
    user_id: creator.id,
    user_name: creator.name,
    user_username: creator.username,
    user_avatar_url: creator.avatarUrl,
  })
  const db = createSupabaseClient()
  const { data, error } = await db.from('chat_messages').insert([chatMessage])
  if (error) {
    console.error(error)
    throw new APIError(500, 'Failed to create chat message.')
  }

  return { status: 'success', chatMessage }
})
