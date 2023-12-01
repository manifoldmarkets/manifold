import { Json } from 'common/supabase/schema'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { ChatVisibility } from 'common/chat-message'

export const leaveChatContent = (userName: string) => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ text: `${userName} left the chat`, type: 'text' }],
    },
  ],
})
export const joinChatContent = (userName: string) => {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ text: `${userName} joined the chat!`, type: 'text' }],
      },
    ],
  }
}

export const insertPrivateMessage = async (
  content: Json,
  channelId: number,
  userId: string,
  visibility: ChatVisibility,
  pg: SupabaseDirectClient
) => {
  const lastMessage = await pg.one(
    `insert into private_user_messages (content, channel_id, user_id, visibility)
    values ($1, $2, $3, $4) returning created_time`,
    [content, channelId, userId, visibility]
  )
  await pg.none(
    `update private_user_message_channels set last_updated_time = $1 where id = $2`,
    [lastMessage.created_time, channelId]
  )
}

export const addUsersToPrivateMessageChannel = async (
  userIds: string[],
  channelId: number,
  pg: SupabaseDirectClient
) => {
  await Promise.all(
    userIds.map((id) =>
      pg.none(
        `insert into private_user_message_channel_members (channel_id, user_id, role, status)
                values
                ($1, $2, 'member', 'proposed')
                on conflict do nothing
              `,
        [channelId, id]
      )
    )
  )
  await pg.none(
    `update private_user_message_channels set last_updated_time = now() where id = $1`,
    [channelId]
  )
}
