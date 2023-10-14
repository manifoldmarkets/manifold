import { db } from 'web/lib/supabase/db'
import { convertSQLtoTS, Row, run, tsToMillis } from 'common/supabase/utils'
import { ChatMessage } from 'common/chat-message'

// NOTE: must be authorized (useIsAuthorized) to use this function
export const getChatMessages = async (channelId: number, limit: number) => {
  const q = db
    .from('private_user_messages')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_time', { ascending: false })
    .limit(limit)
  const { data } = await run(q)
  return data
}
export const convertChatMessage = (row: Row<'private_user_messages'>) =>
  convertSQLtoTS<'private_user_messages', ChatMessage>(row, {
    created_time: tsToMillis as any,
  })

// NOTE: must be authorized (useIsAuthorized) to use this function
export const getChannelLastSeenTimeQuery = (
  channelId: number,
  userId: string
) =>
  db
    .from('private_user_seen_message_channels')
    .select('created_time')
    .eq('user_id', userId)
    .eq('channel_id', channelId)
    .order('created_time', { ascending: false })
    .limit(1)

// NOTE: must be authorized (useIsAuthorized) to use this function
export const getMessageChannelMemberships = async (
  userId: string,
  limit: number,
  channelId?: string
) => {
  // TODO: keep this one in memory:
  let q = db
    .from('private_user_message_channel_members')
    .select('*')
    .eq('user_id', userId)
    .order('created_time', { ascending: false })
    .limit(limit)
  if (channelId) q = q.eq('channel_id', channelId)
  const { data } = await run(q)

  return data
}

// NOTE: must be authorized (useIsAuthorized) to use this function
export const getChatMessageChannelIds = async (
  userId: string,
  limit: number,
  channelId?: string
) => {
  const memberhips = (await getMessageChannelMemberships(userId, limit)).map(
    (m) => m.channel_id
  )
  if (channelId) return memberhips
  else {
    const orderedIds = await run(
      db
        .from('private_user_message_channels')
        .select('id')
        .in('id', memberhips)
        .order('last_updated_time', { ascending: false })
    )
    return orderedIds.data.map((d) => d.id)
  }
}

// NOTE: must be authorized (useIsAuthorized) to use this function
export const getOtherUserIdsInPrivateMessageChannelIds = async (
  userId: string,
  channelIds: number[],
  limit: number
) => {
  const channelIdToUserIds: Record<number, string[]> = {}
  const q = db
    .from('private_user_message_channel_members')
    .select('channel_id, user_id')
    .neq('user_id', userId)
    .in('channel_id', channelIds)
    .order('created_time', { ascending: false })
    .limit(limit)
  const { data } = await run(q)

  data.forEach((d) =>
    channelIdToUserIds[d.channel_id] === undefined
      ? (channelIdToUserIds[d.channel_id] = [d.user_id])
      : channelIdToUserIds[d.channel_id].push(d.user_id)
  )
  return channelIdToUserIds
}
