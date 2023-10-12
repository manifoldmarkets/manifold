import { z } from 'zod'
import { APIError, authEndpoint, validate } from 'api/helpers'
import * as admin from 'firebase-admin'
import { removeUndefinedProps } from 'common/util/object'
import { getUser, getUserSupabase } from 'shared/utils'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { Json } from 'common/supabase/schema'
import { contentSchema } from 'shared/zod-types'

const postSchema = z.object({
  content: contentSchema,
  channelId: z.number().gte(0).int(),
})

export const createprivateusermessage = authEndpoint(async (req, auth) => {
  const { content, channelId } = validate(postSchema, req.body)

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

  const lastMessage = await pg.one(
    `insert into private_user_messages (content, channel_id, user_id)
    values ($1, $2, $3) returning created_time`,
    [content, channelId, creator.id]
  )
  await pg.none(
    `update private_user_message_channels set last_updated_time = $1 where id = $2`,
    [lastMessage.created_time, channelId]
  )

  const privateMessage = {
    content: content as Json,
    channel_id: channelId,
    user_id: creator.id,
  }

  return { status: 'success', privateMessage }
})
