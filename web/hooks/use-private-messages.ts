import { ChatMessage } from 'common/chat-message'
import { run, tsToMillis } from 'common/supabase/utils'
import { usePersistentSubscription } from 'web/lib/supabase/realtime/use-subscription'
import { useEffect, useState } from 'react'
import { first, groupBy, orderBy } from 'lodash'
import { useIsAuthorized } from 'web/hooks/use-user'
import { safeLocalStorage } from 'web/lib/util/local'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import {
  convertChatMessage,
  getChannelLastSeenTimeQuery,
  getChatMessageChannelIds,
  getChatMessages,
  getMessageChannelMemberships,
  getOtherUserIdsInPrivateMessageChannelIds,
} from 'web/lib/supabase/private-messages'

// NOTE: must be authorized (useIsAuthorized) to use this hook
export function useRealtimePrivateMessages(
  channelId: number,
  isAuthed: boolean
) {
  if (!isAuthed) {
    console.error('useRealtimePrivateMessages must be authorized')
  }
  const { rows } = usePersistentSubscription(
    `private-user-messages-${channelId}`,
    'private_user_messages',
    safeLocalStorage,
    { k: 'channel_id', v: channelId },
    () => getChatMessages(channelId, 100)
  )
  return orderBy(rows?.map(convertChatMessage), 'createdTime', 'desc')
}

// NOTE: must be authorized (useIsAuthorized) to use this hook
export function useRealtimePrivateMessageChannelMemberships(
  userId: string,
  isAuthed: boolean
) {
  if (!isAuthed) {
    console.error(
      'useRealtimePrivateMessageChannelMemberships must be authorized'
    )
  }
  const { rows } = usePersistentSubscription(
    `private-user-channel-memberships-${userId}`,
    'private_user_message_channel_members',
    safeLocalStorage,
    { k: 'user_id', v: userId },
    () => getMessageChannelMemberships(userId, 100)
  )
  return rows
}

export const useHasUnseenPrivateMessage = (
  userId: string | undefined,
  channelId: number,
  chats: ChatMessage[] | undefined
) => {
  const [lastSeenChatTime, setLastSeenChatTime] = useState<number>()
  const isAuthed = useIsAuthorized()
  useEffect(() => {
    if (!userId || !isAuthed) return
    run(getChannelLastSeenTimeQuery(channelId, userId)).then(({ data }) =>
      setLastSeenChatTime(tsToMillis(first(data)?.created_time ?? '0'))
    )
  }, [isAuthed, userId, chats?.length])

  const lastChatMessage = first(
    chats?.filter((c) => c.userId !== userId)
  )?.createdTime
  return (
    lastChatMessage && lastSeenChatTime && lastChatMessage > lastSeenChatTime
  )
}

// NOTE: must be authorized (useIsAuthorized) to use this hook
export const useUnseenPrivateMessageChannels = (
  userId: string,
  isAuthed: boolean
) => {
  if (!isAuthed) {
    console.error('useUnseenPrivateMessageChannels must be authorized')
  }
  const [lastSeenChatTimeByChannelId, setLastSeenChatTimeByChannelId] =
    usePersistentLocalState<Record<number, number> | undefined>(
      undefined,
      `private-message-channel-last-seen-${userId}`
    )

  const messageChannels = useRealtimePrivateMessageChannelMemberships(
    userId,
    isAuthed
  )
  const channelIds = messageChannels?.map((m) => m.channel_id) ?? []

  // also poll last_updated_time for all message channels to compare last_updated_time to last time viewed that channel page
  const { rows: messageRows } = usePersistentSubscription(
    `private_messages-${userId}`,
    'private_user_messages',
    safeLocalStorage,
    undefined,
    undefined,
    `channel_id=in.(${channelIds.join(', ')})`
  )
  const allMessagesByChannelId = groupBy(
    orderBy(messageRows?.map(convertChatMessage), 'createdTime', 'desc'),
    (m) => m.channelId
  )

  // const {isReady, pathname} = useRouter()
  useEffect(() => {
    if (!isAuthed) return
    // TODO: we should probably just query for the new message channel's last seen time, not all of them
    channelIds.map((channelId) => {
      run(getChannelLastSeenTimeQuery(channelId, userId)).then(({ data }) =>
        setLastSeenChatTimeByChannelId((prev) => ({
          ...prev,
          [channelId]: tsToMillis(first(data)?.created_time ?? '0'),
        }))
      )
    })
  }, [isAuthed, messageRows?.length])

  if (!lastSeenChatTimeByChannelId) return []
  return Object.keys(allMessagesByChannelId)
    .map((channelId) => {
      const lastSeenChatTime =
        lastSeenChatTimeByChannelId[channelId as any] ?? 0
      return allMessagesByChannelId[channelId]?.filter(
        (c) => c.userId !== userId && c.createdTime > lastSeenChatTime
      )
    })
    .flat()
}

export const usePrivateMessageChannelIds = (
  userId: string | undefined,
  isAuthed: boolean | undefined
) => {
  const [channelIds, setChannelIds] = usePersistentLocalState<number[]>(
    [],
    `private-message-channel-ids-${userId}`
  )
  useEffect(() => {
    if (userId && isAuthed)
      getChatMessageChannelIds(userId, 100).then(setChannelIds)
  }, [userId, isAuthed])
  return channelIds
}

export const useOtherUserIdsInPrivateMessageChannelIds = (
  userId: string | undefined,
  isAuthed: boolean | undefined,
  channelIds: number[] | undefined
) => {
  const [chanelIdToUserIds, setChanelIdToUserIds] = usePersistentLocalState<
    Record<number, string> | undefined
  >(undefined, `private-message-channel-ids-to-user-ids-${userId}`)
  useEffect(() => {
    if (
      userId &&
      isAuthed &&
      channelIds &&
      channelIds.some((c) => chanelIdToUserIds?.[c] === undefined)
    )
      getOtherUserIdsInPrivateMessageChannelIds(userId, channelIds, 100).then(
        setChanelIdToUserIds
      )
  }, [userId, isAuthed, channelIds?.length])
  return chanelIdToUserIds
}
