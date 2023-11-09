import { ChatMessage } from 'common/chat-message'
import { millisToTs, Row, run, tsToMillis } from 'common/supabase/utils'
import { usePersistentSubscription } from 'web/lib/supabase/realtime/use-subscription'
import { useEffect } from 'react'
import {
  NumericDictionary,
  first,
  groupBy,
  maxBy,
  orderBy,
  uniqBy,
  uniq,
} from 'lodash'
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
  getTotalChatMessages,
} from 'web/lib/supabase/private-messages'
import { usePersistentSupabasePolling } from 'web/hooks/use-persistent-supabase-polling'
import { db } from 'web/lib/supabase/db'
import { MINUTE_MS } from 'common/util/time'
import { safeLocalStorage } from 'web/lib/util/local'
import { useEvent } from 'web/hooks/use-event'
import { useRouter } from 'next/router'

// NOTE: must be authorized (useIsAuthorized) to use this hook
export function useRealtimePrivateMessagesPolling(
  channelId: number,
  isAuthed: boolean,
  ms: number,
  initialLimit = 50,
  ignoreSystemStatus = false
) {
  if (!isAuthed) {
    console.error('useRealtimePrivateMessages must be authorized')
  }
  let allRowsQ = db
    .from('private_user_messages')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_time', { ascending: false })
    .limit(initialLimit)
  if (ignoreSystemStatus) allRowsQ = allRowsQ.neq('visibility', 'system_status')

  const newRowsOnlyQ = (rows: Row<'private_user_messages'>[] | undefined) => {
    // You can't use allRowsQ here because it keeps tacking on another gt clause
    let q = db
      .from('private_user_messages')
      .select('*')
      .eq('channel_id', channelId)
      .gt('id', maxBy(rows, 'id')?.id ?? 0)
    if (ignoreSystemStatus) q = q.neq('visibility', 'system_status')
    return q
  }

  const results = usePersistentSupabasePolling(
    allRowsQ,
    newRowsOnlyQ,
    `private-messages-${channelId}-${ms}ms-${initialLimit}limit`,
    {
      ms,
      deps: [channelId],
      shouldUseLocalStorage: true,
    }
  )
  return results
    ? orderBy(results.data.map(convertChatMessage), 'createdTime', 'desc')
    : undefined
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
    'private_user_message_channel_members',
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
  const [lastSeenChatTime, setLastSeenChatTime] = usePersistentLocalState<
    number | undefined
  >(undefined, `private-message-channel-last-seen-${userId}-${channelId}`)
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
  if (!isAuthed)
    console.error('useUnseenPrivateMessageChannels must be authorized')

  const { asPath } = useRouter()
  const lastSeenMessagesPageTime = useLastSeenMessagesPageTime(userId)
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
    const q = Promise.all(
      channelIds.map(async (channelId) =>
        run(
          db
            .from('private_user_messages')
            .select('*')
            .eq('channel_id', channelId)
            .gt('created_time', millisToTs(lastSeenMessagesPageTime))
            .neq('visibility', 'system_status')
            .limit(1)
            .order('created_time', { ascending: false })
        )
      )
    )
    const data = await q
    return data.map((d) => d.data).flat()
  })

  const { rows: messageRows } = usePersistentSubscription(
    'private_user_messages_all_channels',
    'private_user_messages',
    safeLocalStorage,
    undefined,
    fetcher,
    `channel_id=in.(${channelIds.join(', ')}),visibility=neq.system_status`
  )
  const allMessagesByChannelId = groupBy(
    orderBy(messageRows?.map(convertChatMessage), 'createdTime', 'desc'),
    (m) => m.channelId
  )

  const fetchLastSeenTimesPerChannel = async (forChannelIds: number[]) => {
    if (!forChannelIds.length) return
    const results = await Promise.all(
      forChannelIds.map(async (channelId) => {
        const { data } = await run(
          getChannelLastSeenTimeQuery(channelId, userId)
        )
        return { channelId, time: tsToMillis(first(data)?.created_time ?? '0') }
      })
    )
    const newState = lastSeenChatTimeByChannelId ?? {}
    results.forEach(({ channelId, time }) => (newState[channelId] = time))
    setLastSeenChatTimeByChannelId(newState)
  }

  useEffect(() => {
    const newMessageRows = messageRows
      ?.filter((m) => tsToMillis(m.created_time) > lastSeenMessagesPageTime)
      .map((m) => m.channel_id)
    if (newMessageRows?.length)
      fetchLastSeenTimesPerChannel(uniq(newMessageRows))
  }, [messageRows?.length])

  useEffect(() => {
    if (
      !lastSeenChatTimeByChannelId ||
      channelIds.some((cId) => lastSeenChatTimeByChannelId[cId] === undefined)
    ) {
      fetchLastSeenTimesPerChannel(channelIds)
    }
  }, [channelIds])

  if (!lastSeenChatTimeByChannelId)
    return {
      unseenMessages: [],
    }

  const unseenMessages = Object.keys(allMessagesByChannelId)
    .map((channelIdString) => {
      const channelId = parseInt(channelIdString)
      const notifyAfterTime = tsToMillis(
        messageChannelMemberships?.find((m) => m.channel_id === channelId)
          ?.notify_after_time ?? '0'
      )
      const lastSeenTime = lastSeenChatTimeByChannelId[channelId] ?? 0
      const lastSeenChatTime =
        notifyAfterTime > lastSeenTime ? notifyAfterTime : lastSeenTime ?? 0

      return allMessagesByChannelId[channelId]?.filter(
        (c) => c.userId !== userId && c.createdTime > lastSeenChatTime
      )
    })
    .flat()
    .filter((message) => message.createdTime > lastSeenMessagesPageTime)
    .filter((message) => !asPath.endsWith(`/messages/${message.channelId}`))

  return { unseenMessages }
}

const useLastSeenMessagesPageTime = (userId: string) => {
  const { isReady, asPath } = useRouter()

  const [lastSeenMessagesPageTime, setLastSeenMessagesPageTime] =
    usePersistentLocalState(0, 'last-seen-private-messages-page')
  useEffect(() => {
    if (isReady && asPath.endsWith('/messages')) {
      setLastSeenMessagesPageTime(Date.now())
      return
    }
    // On every path change, check the last time we saw the messages page
    run(
      db
        .from('user_events')
        .select('ts')
        .eq('name', 'view love messages page')
        .eq('user_id', userId)
        .order('ts', { ascending: false })
        .limit(1)
    ).then(({ data }) => {
      setLastSeenMessagesPageTime(new Date(data[0]?.ts ?? 0).valueOf())
    })
  }, [isReady, asPath])

  return lastSeenMessagesPageTime
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
  const [channelMemberships, setChannelMemberships] = usePersistentLocalState<
    PrivateMessageMembership[] | undefined
  >(undefined, `private-message-channel-memberships-${userId}`)
  useEffect(() => {
    if (
      userId &&
      isAuthed &&
      channels &&
      channels.some((c) => {
        const matchingMembership = channelMemberships?.find(
          (cm) => cm.channel_id === c.id
        )
        // TODO: probably should keep track of when we last checked the membership status vs last 5 minutes
        return (
          !matchingMembership ||
          matchingMembership?.status === undefined ||
          tsToMillis(c?.last_updated_time ?? '0') > Date.now() - 5 * MINUTE_MS
        )
      })
    ) {
      // Non general chat
      getOtherUserIdsInPrivateMessageChannelIds(
        userId,
        channels.filter((c) => !c.title).map((c) => c.id),
        100
      ).then((c) =>
        setChannelMemberships((prev) =>
          uniqBy([...(prev ?? []), ...c], (cm) => cm.user_id + cm.channel_id)
        )
      )
      // General chat w/ tons of users
      getOtherUserIdsInPrivateMessageChannelIds(
        userId,
        channels.filter((c) => c.title).map((c) => c.id),
        50
      ).then((c) =>
        setChannelMemberships((prev) =>
          uniqBy([...(prev ?? []), ...c], (cm) => cm.user_id + cm.channel_id)
        )
      )
    }
  }, [userId, isAuthed, JSON.stringify(channels)])
  return groupBy(channelMemberships, 'channel_id') as NumericDictionary<
    PrivateMessageMembership[]
  >
}

export const useMessagesCount = (
  isAuthed: boolean | undefined,
  channelId: number
) => {
  const [count, setCount] = usePersistentLocalState<number>(
    0,
    `private-message-count-channel-id-${channelId}`
  )

  useEffect(() => {
    if (isAuthed) getTotalChatMessages(channelId).then((c) => setCount(c))
  }, [isAuthed])
  return count
}
