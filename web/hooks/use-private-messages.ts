import { ChatMessage } from 'common/chat-message'
import { millisToTs, Row, tsToMillis } from 'common/supabase/utils'
import { useEffect } from 'react'
import {
  NumericDictionary,
  first,
  groupBy,
  orderBy,
  uniqBy,
  uniq,
  sortBy,
  last,
} from 'lodash'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import {
  getSortedChatMessageChannels,
  getOtherUserIdsInPrivateMessageChannelIds,
  PrivateMessageMembership,
  getTotalChatMessages,
} from 'web/lib/supabase/private-messages'
import { usePersistentApiPolling } from 'web/hooks/use-persistent-supabase-polling'
import { MINUTE_MS } from 'common/util/time'
import { useEvent } from 'web/hooks/use-event'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { track } from 'web/lib/service/analytics'
import { usePathname } from 'next/navigation'
import { api } from 'web/lib/api/api'
import {
  convertChatMessage,
  PrivateMessageChannel,
} from 'common/supabase/private-messages'

// NOTE: must be authorized (useIsAuthorized) to use this hook
export function useRealtimePrivateMessagesPolling(
  channelId: number,
  ms: number,
  initialLimit = 50
) {
  const allRowsQ = api('get-channel-messages', {
    channelId,
    limit: initialLimit,
  }) as any
  const newRowsOnlyQ = (rows: Row<'private_user_messages'>[] | undefined) => {
    const latest = last(sortBy(rows, 'created_time'))
    return api('get-channel-messages', {
      id: latest?.id,
      channelId,
      limit: 100,
    }) as any
  }

  const results = usePersistentApiPolling(
    'private_user_messages',
    allRowsQ,
    newRowsOnlyQ,
    `private-messages-${channelId}-${ms}ms-${initialLimit}limit-v1`,
    {
      ms,
      deps: [channelId],
      shouldUseLocalStorage: true,
    }
  )
  return results
    ? orderBy(results.map(convertChatMessage), 'createdTime', 'desc')
    : undefined
}

export function usePrivateMessageChannelMembershipsPolling() {
  const allRowsQ = api('get-channel-memberships', { limit: 100 }) as any
  const newRowsOnlyQ = (
    rows: Row<'private_user_message_channel_members'>[] | undefined
  ) => {
    const latest = last(sortBy(rows, 'created_time'))
    return api('get-channel-memberships', {
      createdTime: latest?.created_time,
      limit: 100,
    }) as any
  }
  const results = usePersistentApiPolling(
    'private_user_message_channel_members',
    allRowsQ,
    newRowsOnlyQ,
    `user-private-message-memberships`,
    {
      ms: 10000,
      deps: [],
      shouldUseLocalStorage: true,
    }
  )

  return results as any as PrivateMessageChannel[]
}

export const useHasUnseenPrivateMessage = (
  userId: string,
  channelId: number,
  chats: ChatMessage[] | undefined
) => {
  const [lastSeenChatTime, setLastSeenChatTime] = usePersistentLocalState<
    number | undefined
  >(undefined, `private-message-channel-last-seen-${userId}-${channelId}`)
  useEffect(() => {
    api('get-channel-seen-time', { channelId }).then((data) =>
      setLastSeenChatTime(tsToMillis(data.created_time))
    )
  }, [chats?.length])

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

  const pathName = usePathname()
  const lastSeenMessagesPageTime = useLastSeenMessagesPageTime()
  const [lastSeenChatTimeByChannelId, setLastSeenChatTimeByChannelId] =
    usePersistentLocalState<Record<number, number> | undefined>(
      undefined,
      `private-message-channel-last-seen-${userId}`
    )

  const messageChannelMemberships = usePrivateMessageChannelMembershipsPolling()
  const channelIds = messageChannelMemberships?.map((m) => m.channel_id) ?? []
  const fetcher = useEvent(async () => {
    const q = Promise.all(
      channelIds.map(async (channelId) => {
        const d = await api('get-channel-messages', {
          channelId,
          limit: 1,
          createdTime: millisToTs(lastSeenMessagesPageTime),
        })
        return d.map(convertChatMessage)
      })
    )
    const data = await q
    setMessageRows(data.flatMap((d) => d))
  })
  useEffect(() => {
    fetcher()
  }, [pathName])

  const [messageRows, setMessageRows] = usePersistentLocalState<ChatMessage[]>(
    [],
    'all-new-messages'
  )

  const allMessagesByChannelId = groupBy(
    orderBy(messageRows, 'createdTime', 'desc'),
    (m) => m.channelId
  )

  const fetchLastSeenTimesPerChannel = async (forChannelIds: number[]) => {
    if (!forChannelIds.length) return
    const results = await Promise.all(
      forChannelIds.map(async (channelId) => {
        const data = await api('get-channel-seen-time', { channelId })
        return { channelId, time: tsToMillis(data.created_time) }
      })
    )
    const newState = lastSeenChatTimeByChannelId ?? {}
    results.forEach(({ channelId, time }) => (newState[channelId] = time))
    setLastSeenChatTimeByChannelId(newState)
  }

  useEffect(() => {
    const newMessageRows = messageRows
      .filter((m) => m.createdTime > lastSeenMessagesPageTime)
      .map((m) => parseInt(m.channelId))
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
    .filter((message) => !pathName?.endsWith(`/messages/${message.channelId}`))

  return { unseenMessages }
}

const useLastSeenMessagesPageTime = () => {
  const pathname = usePathname()
  const isVisible = useIsPageVisible()

  const [lastSeenMessagesPageTime, setLastSeenMessagesPageTime] =
    usePersistentLocalState(0, 'last-seen-private-messages-page')
  useEffect(() => {
    if (pathname === '/messages') {
      setLastSeenMessagesPageTime(Date.now())
      track('view messages page')
      return
    }
  }, [pathname, isVisible])

  return lastSeenMessagesPageTime
}

export const useSortedPrivateMessageChannelIds = (
  userId: string | undefined,
  isAuthed: boolean | undefined
) => {
  const [channelIds, setChannelIds] = usePersistentLocalState<
    PrivateMessageChannel[] | undefined
  >(undefined, `private-message-channel-ids-${userId}`)
  useEffect(() => {
    if (userId && isAuthed)
      getSortedChatMessageChannels(100).then(setChannelIds)
  }, [userId, isAuthed])
  return channelIds
}

export const usePrivateMessageChannel = (
  userId: string | undefined,
  isAuthed: boolean | undefined,
  forChannelId: string
) => {
  const [channelId, setChannelId] = usePersistentLocalState<
    PrivateMessageChannel | undefined
  >(undefined, `private-message-channel-id-${userId}-${forChannelId}`)
  useEffect(() => {
    if (userId && isAuthed)
      getSortedChatMessageChannels(1, forChannelId).then((c) =>
        setChannelId(first(c))
      )
  }, [userId, isAuthed])
  return channelId
}

export const useNonEmptyPrivateMessageChannels = (
  userId: string | undefined
) => {
  const [channels, setChannels] = usePersistentLocalState<
    PrivateMessageChannel[]
  >([], `non-empty-private-message-channel-ids-${userId}`)
  useEffect(() => {
    if (userId) getSortedChatMessageChannels(100).then(setChannels)
  }, [userId])
  return channels
}

export const useOtherUserIdsInPrivateMessageChannelIds = (
  userId: string | undefined,
  channels: PrivateMessageChannel[] | undefined
) => {
  const [channelMemberships, setChannelMemberships] = usePersistentLocalState<
    PrivateMessageMembership[] | undefined
  >(undefined, `private-message-channel-memberships-${userId}`)
  useEffect(() => {
    if (
      userId &&
      channels &&
      channels.some((c) => {
        const matchingMembership = channelMemberships?.find(
          (cm) => cm.channel_id === c.channel_id
        )
        // TODO: probably should keep track of when we last checked the membership status vs last 5 minutes
        return (
          !matchingMembership ||
          tsToMillis(c?.last_updated_time ?? '0') > Date.now() - 5 * MINUTE_MS
        )
      })
    ) {
      // Non general chat
      getOtherUserIdsInPrivateMessageChannelIds(
        channels.map((c) => c.channel_id),
        100
      ).then((c) =>
        setChannelMemberships((prev) =>
          uniqBy([...(prev ?? []), ...c], (cm) => cm.user_id + cm.channel_id)
        )
      )
    }
  }, [userId, JSON.stringify(channels)])
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
