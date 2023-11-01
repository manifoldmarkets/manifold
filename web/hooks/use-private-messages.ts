import { ChatMessage } from 'common/chat-message'
import { millisToTs, Row, run, tsToMillis } from 'common/supabase/utils'
import { useSubscription } from 'web/lib/supabase/realtime/use-subscription'
import { useEffect, useState } from 'react'
import { NumericDictionary, first, groupBy, maxBy, orderBy } from 'lodash'
import { useIsAuthorized } from 'web/hooks/use-user'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import {
  convertChatMessage,
  getChannelLastSeenTimeQuery,
  getSortedChatMessageChannels,
  getMessageChannelMemberships,
  getNonEmptyChatMessageChannelIds,
  getOtherUserIdsInPrivateMessageChannelIds,
  PrivateMessageMembership,
} from 'web/lib/supabase/private-messages'
import { usePersistentSupabasePolling } from 'web/hooks/use-persistent-supabase-polling'
import { db } from 'web/lib/supabase/db'
import { useEvent } from 'web/hooks/use-event'
import { MINUTE_MS } from 'common/util/time'

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
  const { rows } = useSubscription(
    'private_user_message_channel_members',
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
  isAuthed: boolean,
  sinceLastTime: number
) => {
  if (!isAuthed) {
    console.error('useUnseenPrivateMessageChannels must be authorized')
  }
  const [lastSeenChatTimeByChannelId, setLastSeenChatTimeByChannelId] =
    usePersistentLocalState<Record<number, number> | undefined>(
      undefined,
      `private-message-channel-last-seen-${userId}`
    )

  const messageChannelMemberships = useRealtimePrivateMessageChannelMemberships(
    userId,
    isAuthed
  )
  const channelIds = messageChannelMemberships?.map((m) => m.channel_id) ?? []
  const fetcher = useEvent(async () => {
    const q = db
      .from('private_user_messages')
      .select('*')
      .in('channel_id', channelIds)
      .gt('created_time', millisToTs(sinceLastTime))
      .limit(100)
      .order('created_time', { ascending: false })
    const { data } = await run(q)
    return data
  })
  const { rows: messageRows } = useSubscription(
    'private_user_messages',
    undefined,
    fetcher,
    undefined,
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
      const notifyAfterTime = tsToMillis(
        messageChannelMemberships?.find(
          (m) => m.channel_id === parseInt(channelId)
        )?.notify_after_time ?? '0'
      )
      const lastSeenTime = lastSeenChatTimeByChannelId[channelId as any] ?? 0
      const lastSeenChatTime =
        notifyAfterTime > lastSeenTime ? notifyAfterTime : lastSeenTime ?? 0
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
    Row<'private_user_message_channels'>[] | undefined
  >(undefined, `private-message-channel-ids-${userId}`)
  useEffect(() => {
    if (userId && isAuthed)
      getSortedChatMessageChannels(userId, 100).then(setChannelIds)
  }, [userId, isAuthed])
  return channelIds
}

export const usePrivateMessageChannel = (
  userId: string | undefined,
  isAuthed: boolean | undefined,
  forChannelId: string
) => {
  const [channelId, setChannelId] = usePersistentLocalState<
    Row<'private_user_message_channels'> | undefined
  >(undefined, `private-message-channel-id-${userId}-${forChannelId}`)
  useEffect(() => {
    if (userId && isAuthed)
      getSortedChatMessageChannels(userId, 1, forChannelId).then((c) =>
        setChannelId(first(c))
      )
  }, [userId, isAuthed])
  return channelId
}

export const useNonEmptyPrivateMessageChannels = (
  userId: string | undefined,
  isAuthed: boolean | undefined
) => {
  const [channels, setChannels] = usePersistentLocalState<
    Row<'private_user_message_channels'>[]
  >([], `non-empty-private-message-channel-ids-${userId}`)
  useEffect(() => {
    if (userId && isAuthed)
      getNonEmptyChatMessageChannelIds(userId, 100).then(setChannels)
  }, [userId, isAuthed])
  return channels
}

export const useOtherUserIdsInPrivateMessageChannelIds = (
  userId: string | undefined,
  isAuthed: boolean | undefined,
  channels: Row<'private_user_message_channels'>[] | undefined
) => {
  const [chanelIdToUserStatuses, setChanelIdToUserIds] =
    usePersistentLocalState<
      NumericDictionary<PrivateMessageMembership[]> | undefined
    >(undefined, `private-message-channel-ids-to-user-ids-${userId}`)
  useEffect(() => {
    if (
      userId &&
      isAuthed &&
      channels &&
      channels.some(
        (c) =>
          chanelIdToUserStatuses?.[c.id] === undefined ||
          chanelIdToUserStatuses?.[c.id]?.[0].status === undefined ||
          // TODO: probably should keep track of when we last checked the membership status vs last 5 minutes
          tsToMillis(
            channels?.find((ch) => ch.id === c.id)?.last_updated_time ?? '0'
          ) >
            Date.now() - 5 * MINUTE_MS
      )
    ) {
      console.log('fetching other user ids in private message channels')
      getOtherUserIdsInPrivateMessageChannelIds(
        userId,
        channels.map((c) => c.id),
        100
      ).then(setChanelIdToUserIds)
    }
  }, [userId, isAuthed, JSON.stringify(channels)])
  return chanelIdToUserStatuses
}
