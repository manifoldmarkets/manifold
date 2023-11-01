import { z } from 'zod'
import { APIError, authEndpoint, validate } from 'api/helpers'
import { getUserSupabase } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Json } from 'common/supabase/schema'
import { contentSchema } from 'shared/zod-types'
import { MAX_COMMENT_JSON_LENGTH } from 'api/create-comment'
import { insertPrivateMessage } from 'shared/supabase/private-messages'

const postSchema = z
  .object({
    content: contentSchema,
    channelId: z.number().gte(0).int(),
  })
  .strict()

export const createprivateusermessage = authEndpoint(async (req, auth) => {
  const { content, channelId } = validate(postSchema, req.body)
  if (JSON.stringify(content).length > MAX_COMMENT_JSON_LENGTH) {
    throw new APIError(
      400,
      `Message JSON should be less than ${MAX_COMMENT_JSON_LENGTH}`
    )
  }
  const pg = createSupabaseDirectClient()
  const creator = await getUserSupabase(auth.uid)
  if (!creator) throw new APIError(401, 'Your account was not found')
  if (creator.isBannedFromPosting) throw new APIError(403, 'You are banned')

  // users can only submit messages to channels that they are members of
  const authorized = await pg.oneOrNone(
    `select 1 from private_user_message_channel_members where channel_id = $1 and user_id = $2`,
    [channelId, auth.uid]
  )
  if (!authorized)
    throw new APIError(403, 'You are not authorized to post to this channel')

  await insertPrivateMessage(content, channelId, auth.uid, 'private', pg)

  const privateMessage = {
    content: content as Json,
    channel_id: channelId,
    user_id: creator.id,
  }

  return { status: 'success', privateMessage }
})
