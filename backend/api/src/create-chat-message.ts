import { z } from 'zod'
import { APIError, authEndpoint, validate } from 'api/helpers'
import * as admin from 'firebase-admin'
import { removeUndefinedProps } from 'common/util/object'
import { getUser } from 'shared/utils'
import { createSupabaseClient } from 'shared/supabase/init'
import { Json } from 'common/supabase/schema'
import { contentSchema } from 'shared/zod-types'

const postSchema = z.object({
  content: contentSchema.optional(),
  channelId: z.string(),
})

export const MAX_COMMENT_JSON_LENGTH = 20000

// For now, only supports creating a new top-level comment on a contract.
// Replies, posts, chats are not supported yet.
export const createchatmessage = authEndpoint(async (req, auth) => {
  const { content, channelId } = validate(postSchema, req.body)

  const creator = await getUser(auth.uid)
  if (!creator) throw new APIError(401, 'Your account was not found')
  if (creator.isBannedFromPosting) throw new APIError(403, 'You are banned')

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
