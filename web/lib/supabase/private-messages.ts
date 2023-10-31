import { db } from 'web/lib/supabase/db'
import { convertSQLtoTS, Row, run, tsToMillis } from 'common/supabase/utils'
import { ChatMessage } from 'common/chat-message'
import { groupBy, NumericDictionary } from 'lodash'

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
  if (channelId) {
    q = q.eq('channel_id', channelId)
  } else {
    q = q.neq('status', 'left')
  }
  const { data } = await run(q)
  return data
}

// NOTE: must be authorized (useIsAuthorized) to use this function
export const getSortedChatMessageChannels = async (
  userId: string,
  limit: number,
  channelId?: string
) => {
  const membershipChannelIds = (
    await getMessageChannelMemberships(userId, limit, channelId)
  ).map((m) => m.channel_id)
  const channels = await run(
    db
      .from('private_user_message_channels')
      .select('*')
      .in('id', membershipChannelIds)
      .order('last_updated_time', { ascending: false })
  )
  return channels.data
}

// Note: must be authorized (useIsAuthorized) to use this function
export const getNonEmptyChatMessageChannelIds = async (
  userId: string,
  limit?: number
) => {
  const orderedNonEmptyIds = await db.rpc(
    'get_non_empty_private_message_channel_ids',
    {
      p_user_id: userId,
      p_ignored_statuses: ['left'],
      p_limit: limit,
    }
  )
  if (orderedNonEmptyIds.data) {
    return orderedNonEmptyIds.data
      .flat()
      .map((d) => d as Row<'private_user_message_channels'>)
  }
  return []
}

export type PrivateMessageMembership = {
  user_id: string
  status: 'proposed' | 'joined' | 'left'
  channel_id: number
}
// NOTE: must be authorized (useIsAuthorized) to use this function
export const getOtherUserIdsInPrivateMessageChannelIds = async (
  userId: string,
  channelIds: number[],
  limit: number
) => {
  // const channelIdToUserIds: Record<number, string[]> = {}
  const q = db
    .from('private_user_message_channel_members')
    .select('channel_id, user_id, status')
    .neq('user_id', userId)
    .in('channel_id', channelIds)
    .order('created_time', { ascending: false })
    .limit(limit)
  const { data } = await run(q)
  return groupBy(data, 'channel_id') as NumericDictionary<
    PrivateMessageMembership[]
  >
}
