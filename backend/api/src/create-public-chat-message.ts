import { isUserBanned } from 'common/ban-utils'
import { removeUndefinedProps } from 'common/util/object'
import { getUser, log } from 'shared/utils'
import { createSupabaseClient } from 'shared/supabase/init'
import { Json } from 'common/supabase/schema'
import { APIError, APIHandler } from 'api/helpers/endpoint'
import { convertPublicChatMessage } from 'common/chat-message'
import { broadcast } from 'shared/websockets/server'
import { getActiveUserBans } from './helpers/rate-limit'

export const createPublicChatMessage: APIHandler<
  'create-public-chat-message'
> = async (body, auth) => {
  const { content, channelId } = body
  const creator = await getUser(auth.uid)
  if (!creator) throw new APIError(401, 'Your account was not found')
  if (creator.userDeleted) throw new APIError(403, 'Your account is deleted')
  const creatorBans = await getActiveUserBans(auth.uid)
  if (isUserBanned(creatorBans, 'posting') || creator.isBannedFromPosting)
    throw new APIError(403, 'You are banned from posting')

  const chatMessage = removeUndefinedProps({
    content: content as Json,
    channel_id: channelId,
    user_id: creator.id,
  })
  const db = createSupabaseClient()
  const { data, error } = await db
    .from('chat_messages')
    .insert([chatMessage])
    .select()
  if (error) {
    log.error(error)
    throw new APIError(500, 'Failed to create chat message.')
  }

  broadcast('public-chat', {})

  return convertPublicChatMessage({
    ...chatMessage,
    id: data[0].id,
    created_time: data[0].created_time,
  })
}
