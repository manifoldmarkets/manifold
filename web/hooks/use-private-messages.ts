import { PrivateChatMessage } from 'common/chat-message'
import { millisToTs, tsToMillis } from 'common/supabase/utils'
import { useEffect } from 'react'
import { first, orderBy, uniq, uniqBy } from 'lodash'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import {
  getSortedChatMessageChannels,
  getTotalChatMessages,
} from 'web/lib/supabase/private-messages'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { track } from 'web/lib/service/analytics'
import { usePathname } from 'next/navigation'
import { api } from 'web/lib/api/api'
import { PrivateMessageChannel } from 'common/supabase/private-messages'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useApiSubscription } from 'web/hooks/use-api-subscription'

export function usePrivateMessages(
  channelId: number,
  limit: number,
  userId: string
) {
  const [messages, setMessages] = usePersistentLocalState<
    PrivateChatMessage[] | undefined
  >(undefined, `private-messages-${channelId}-${limit}-v1`)
  const [newestId, setNewestId] = usePersistentLocalState<number | undefined>(
    undefined,
    `private-message-newest-id-${channelId}`
  )
  const fetchMessages = async () => {
    if (messages === undefined) {
      const initialMessages = await api('get-channel-messages', {
        channelId,
        limit,
      })
      setMessages(initialMessages)
      setNewestId(initialMessages[0]?.id)
    } else if (newestId !== undefined) {
      const newMessages = await api('get-channel-messages', {
        channelId,
        limit,
        id: newestId,
      })
      setMessages((prevMessages) =>
        orderBy(
          uniqBy([...newMessages, ...(prevMessages ?? [])], (m) => m.id),
          'createdTime',
          'desc'
        )
      )
      if (newMessages.length > 0 && newMessages[0].id !== newestId) {
        setNewestId(newMessages[0].id)
      }
    }
  }
  useEffect(() => {
    fetchMessages()
  }, [channelId, limit, messages?.length, newestId])

  useApiSubscription({
    topics: ['private-user-messages/' + userId],
    onBroadcast: () => {
      fetchMessages()
    },
  })

  return messages
}

export const useHasUnseenPrivateMessage = (
  userId: string,
  channelId: number,
  chats: PrivateChatMessage[] | undefined
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
