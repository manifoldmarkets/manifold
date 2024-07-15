import { ChatMessage } from 'common/chat-message'
import { millisToTs, Row, tsToMillis } from 'common/supabase/utils'
import { useEffect } from 'react'
import { first, last, orderBy, sortBy, uniq } from 'lodash'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import {
  getSortedChatMessageChannels,
  getTotalChatMessages,
} from 'web/lib/supabase/private-messages'
import { usePersistentApiPolling } from 'web/hooks/use-persistent-supabase-polling'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { track } from 'web/lib/service/analytics'
import { usePathname } from 'next/navigation'
import { api } from 'web/lib/api/api'
import {
  convertChatMessage,
  PrivateMessageChannel,
} from 'common/supabase/private-messages'
import { useAPIGetter } from 'web/hooks/use-api-getter'

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

export const useHasUnseenPrivateMessage = (
  userId: string,
  channelId: number,
  chats: ChatMessage[] | undefined
) => {
  const [lastSeenChatTime, setLastSeenChatTime] = usePersistentLocalState<
    number | undefined
  >(undefined, `private-message-channel-last-seen-${userId}-${channelId}-v1`)
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

export const useUnseenPrivateMessageChannels = (userId: string) => {
  const pathName = usePathname()
  const lastSeenMessagesPageTime = useLastSeenMessagesPageTime()
  const [lastSeenChatTimeByChannelId, setLastSeenChatTimeByChannelId] =
    usePersistentLocalState<Record<number, number> | undefined>(
      undefined,
      `private-message-channel-last-seen-${userId}-v1`
    )

  const { data, refresh } = useAPIGetter('get-channel-memberships', {
    lastUpdatedTime: millisToTs(lastSeenMessagesPageTime),
    limit: 100,
  })
  const { channels } = data ?? {
    channels: [] as PrivateMessageChannel[],
    memberIdsByChannelId: {},
  }

  useEffect(() => {
    refresh()
  }, [pathName])

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
    const newMessageRows = channels
      .filter((m) => tsToMillis(m.last_updated_time) > lastSeenMessagesPageTime)
      .map((m) => m.channel_id)
    if (newMessageRows?.length)
      fetchLastSeenTimesPerChannel(uniq(newMessageRows))
  }, [channels?.length])

  useEffect(() => {
    if (
      !lastSeenChatTimeByChannelId ||
      channels.some(
        (c) => lastSeenChatTimeByChannelId[c.channel_id] === undefined
      )
    ) {
      fetchLastSeenTimesPerChannel(channels.map((c) => c.channel_id))
    }
  }, [channels?.length])

  if (!lastSeenChatTimeByChannelId) return []
  return channels.filter((channel) => {
    const channelId = channel.channel_id
    const notifyAfterTime = tsToMillis(
      channels?.find((m) => m.channel_id === channelId)?.notify_after_time ??
        '0'
    )
    const lastSeenTime = lastSeenChatTimeByChannelId[channelId] ?? 0
    const lastSeenChatTime =
      notifyAfterTime > lastSeenTime ? notifyAfterTime : lastSeenTime ?? 0
    return (
      tsToMillis(channel.last_updated_time) > lastSeenChatTime &&
      tsToMillis(channel.last_updated_time) > lastSeenMessagesPageTime &&
      !pathName?.endsWith(`/messages/${channelId}`)
    )
  })
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

export type ChannelMembership = {
  channels: PrivateMessageChannel[]
  memberIdsByChannelId: { [key: string]: string[] }
}

export const useSortedPrivateMessageMemberships = (
  userId: string | undefined,
  limit: number = 100,
  forChannelId?: number
) => {
  const [channelMemberships, setChannelMemberships] = usePersistentLocalState<
    ChannelMembership | undefined
  >(undefined, `private-message-memberships-${userId}-${forChannelId}-v1`)

  useEffect(() => {
    if (userId)
      getSortedChatMessageChannels(limit, forChannelId).then(
        setChannelMemberships
      )
  }, [userId, forChannelId])
  return (
    channelMemberships ?? {
      channels: undefined,
      memberIdsByChannelId: undefined,
    }
  )
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
