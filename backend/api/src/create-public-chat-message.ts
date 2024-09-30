import { getUser } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, APIHandler } from 'api/helpers/endpoint'
import { convertPublicChatMessage } from 'common/chat-message'
import { broadcast } from 'shared/websockets/server'
import { insert } from 'shared/supabase/utils'

export const createPublicChatMessage: APIHandler<
  'create-public-chat-message'
> = async (body, auth) => {
  const { content, channelId } = body
  const creator = await getUser(auth.uid)
  if (!creator) throw new APIError(401, 'Your account was not found')
  if (creator.isBannedFromPosting || creator.userDeleted)
    throw new APIError(403, 'You are banned or deleted.')

  const pg = createSupabaseDirectClient()

  const messageRow = await insert(pg, 'chat_messages', {
    content: content,
    channel_id: channelId,
    user_id: creator.id,
  })

  broadcast('public-chat', {})

  return convertPublicChatMessage(messageRow)
}
