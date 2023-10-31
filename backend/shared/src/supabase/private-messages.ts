import { Json } from 'common/supabase/schema'
import { SupabaseDirectClient } from 'shared/supabase/init'

export const insertPrivateMessage = async (
  content: Json,
  channelId: number,
  userId: string,
  visibility: 'private' | 'system_status',
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
              `,
        [channelId, id]
      )
    )
  )
}
