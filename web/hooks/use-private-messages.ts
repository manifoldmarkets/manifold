import { ChatMessage } from 'common/chat-message'
import { Row, run, tsToMillis } from 'common/supabase/utils'
import { usePersistentSubscription } from 'web/lib/supabase/realtime/use-subscription'
import { useEffect, useState } from 'react'
import { NumericDictionary, first, groupBy, maxBy, orderBy } from 'lodash'
import { useIsAuthorized } from 'web/hooks/use-user'
import { safeLocalStorage, safeSessionStorage } from 'web/lib/util/local'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import {
  convertChatMessage,
  getChannelLastSeenTimeQuery,
  getSortedChatMessageChannelIds,
  getMessageChannelMemberships,
  getNonEmptyChatMessageChannelIds,
  getOtherUserIdsInPrivateMessageChannelIds,
  PrivateMessageMembership,
} from 'web/lib/supabase/private-messages'
import { usePersistentSupabasePolling } from 'web/hooks/use-persistent-supabase-polling'
import { db } from 'web/lib/supabase/db'

// NOTE: must be authorized (useIsAuthorized) to use this hook
export function useRealtimePrivateMessagesPolling(
  channelId: number,
  isAuthed: boolean,
  ms: number
) {
  if (!isAuthed) {
    console.error('useRealtimePrivateMessages must be authorized')
  }
  const allRowsQ = db
    .from('private_user_messages')
    .select('*')
    .eq('channel_id', channelId)
  const newRowsOnlyQ = (rows: Row<'private_user_messages'>[] | undefined) =>
    // You can't use allRowsQ here because it keeps tacking on another gt clause
    db
      .from('private_user_messages')
      .select('*')
      .eq('channel_id', channelId)
      .gt('id', maxBy(rows, 'id')?.id ?? 0)

  const results = usePersistentSupabasePolling(
    allRowsQ,
    newRowsOnlyQ,
    `private-messages-${channelId}`,
    {
      ms,
      deps: [channelId],
    }
  )
  return orderBy(results?.data?.map(convertChatMessage), 'createdTime', 'desc')
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
    safeSessionStorage,
    undefined,
    undefined, // no need to fetch old messages, just fetch new ones
    `channel_id=in.(${channelIds.join(', ')})`
  )
  const allMessagesByChannelId = groupBy(
    orderBy(messageRows?.map(convertChatMessage), 'createdTime', 'desc'),
    (m) => m.channelId
  )

  const fetchLastSeenTimes = async () => {
    if (!isAuthed) return

    // TODO: we should probably just query for the new message channel's last seen time, not all of them
    const results = await Promise.all(
      channelIds.map(async (channelId) => {
        const { data } = await run(
          getChannelLastSeenTimeQuery(channelId, userId)
        )
        return { channelId, time: tsToMillis(first(data)?.created_time ?? '0') }
      })
    )

    const newState: Record<number, number> = {}
    results.forEach(({ channelId, time }) => (newState[channelId] = time))
    setLastSeenChatTimeByChannelId(newState)
  }

  useEffect(() => {
    fetchLastSeenTimes()
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

export const useSortedPrivateMessageChannelIds = (
  userId: string | undefined,
  isAuthed: boolean | undefined
) => {
  const [channelIds, setChannelIds] = usePersistentLocalState<
    number[] | undefined
  >(undefined, `private-message-channel-ids-${userId}`)
  useEffect(() => {
    if (userId && isAuthed)
      getSortedChatMessageChannelIds(userId, 100).then(setChannelIds)
  }, [userId, isAuthed])
  return channelIds
}

export const usePrivateMessageChannelId = (
  userId: string | undefined,
  isAuthed: boolean | undefined,
  forChannelId: string
) => {
  const [channelId, setChannelId] = usePersistentLocalState<number | undefined>(
    undefined,
    `private-message-channel-id-${userId}-${forChannelId}`
  )
  useEffect(() => {
    if (userId && isAuthed)
      getSortedChatMessageChannelIds(userId, 1, forChannelId).then((c) =>
        setChannelId(first(c))
      )
  }, [userId, isAuthed])
  return channelId
}

export const useNonEmptyPrivateMessageChannelIds = (
  userId: string | undefined,
  isAuthed: boolean | undefined
) => {
  const [channelIds, setChannelIds] = usePersistentLocalState<number[]>(
    [],
    `non-empty-private-message-channel-ids-${userId}`
  )
  useEffect(() => {
    if (userId && isAuthed)
      getNonEmptyChatMessageChannelIds(userId, 100).then(setChannelIds)
  }, [userId, isAuthed])
  return channelIds
}

export const useOtherUserIdsInPrivateMessageChannelIds = (
  userId: string | undefined,
  isAuthed: boolean | undefined,
  channelIds: number[] | undefined
) => {
  const [chanelIdToUserIds, setChanelIdToUserIds] = usePersistentLocalState<
    NumericDictionary<PrivateMessageMembership[]> | undefined
  >(undefined, `private-message-channel-ids-to-user-ids-${userId}`)
  useEffect(() => {
    if (
      userId &&
      isAuthed &&
      channelIds &&
      channelIds.some(
        (c) =>
          chanelIdToUserIds?.[c] === undefined ||
          chanelIdToUserIds?.[c]?.[0].status === undefined
      )
    )
      getOtherUserIdsInPrivateMessageChannelIds(userId, channelIds, 100).then(
        setChanelIdToUserIds
      )
  }, [userId, isAuthed, channelIds?.length])
  return chanelIdToUserIds
}
