import { db } from 'web/lib/supabase/db'
import { ChatMessage } from 'common/chat-message'
import { mapTypes, Row, run, tsToMillis } from 'common/supabase/utils'
import { useSubscription } from 'web/lib/supabase/realtime/use-subscription'
import { useEffect, useState } from 'react'
import { first, last } from 'lodash'
import { getLeagueChatChannelId } from 'common/league-chat'
import { filterDefined } from 'common/util/array'

export const getChatMessages = async (
  channelId: string,
  limit: number,
  ignoreId?: string
) => {
  let q = db
    .from('chat_messages')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_time', { ascending: false })
    .limit(limit)
  if (ignoreId) {
    q = q.neq('user_id', ignoreId)
  }
  const { data } = await run(q)
  return data.reverse()
}

export function useRealtimeChatsOnLeague(channelId: string, limit: number) {
  const { rows } = useSubscription(
    'chat_messages',
    { k: 'channel_id', v: channelId },
    () => getChatMessages(channelId, limit)
  )
  return rows?.map(convertChatMessage)
}
const convertChatMessage = (row: Row<'chat_messages'>) =>
  mapTypes<'chat_messages', ChatMessage>(row, {
    created_time: tsToMillis as any,
  })

const getLastChatInChannelQuery = (channelId: string, userId: string) =>
  db
    .from('user_seen_chats')
    .select('created_time')
    .eq('user_id', userId)
    .eq('channel_id', channelId)
    .order('created_time', { ascending: false })
    .limit(1)
export const useHasUnseenLeagueChat = (
  channelId: string,
  userId: string | undefined
) => {
  const [lastSeenChat, setLastSeenChat] = useState<number>()
  const [unseen, setUnseen] = useState(true)
  const chats = useRealtimeChatsOnLeague(channelId, 1)
  useEffect(() => {
    if (!userId || !channelId) return
    run(getLastChatInChannelQuery(channelId, userId)).then(({ data }) =>
      setLastSeenChat(tsToMillis(first(data)?.created_time ?? '0'))
    )
  }, [])
  const lastChatMessage = last(
    chats?.filter((c) => c.userId !== userId)
  )?.createdTime
  return [
    unseen && lastChatMessage && lastSeenChat && lastChatMessage > lastSeenChat,
    setUnseen,
  ] as const
}

export const useAllUnseenChatsForLeages = (
  userId: string | undefined,
  leagueInfos: {
    season: number
    cohort: string
    division: number
  }[],
  currentLeagueInfo: {
    season: number
    cohort: string
    division: number
  }
) => {
  const leagueChatChannelIds = leagueInfos.map(({ season, cohort, division }) =>
    getLeagueChatChannelId(season, division, cohort)
  )
  const [lastSeenChats, setLastSeenChats] = useState<Record<string, number>>({})
  const [lastMessageTimes, setLastMessageTimes] = useState<
    Record<string, number>
  >({})
  const [unseenChats, setUnseenChats] = useState<string[]>([])
  const { season, division, cohort } = currentLeagueInfo
  const realtimeMessages = useRealtimeChatsOnLeague(
    getLeagueChatChannelId(season, division, cohort),
    1
  )?.filter((c) => c.userId !== userId)

  useEffect(() => {
    if (!userId) return
    Promise.all(
      leagueChatChannelIds.map((channelId) =>
        getChatMessages(channelId, 1).then((data) =>
          setLastMessageTimes((prev) => ({
            ...prev,
            [channelId]: tsToMillis(first(data)?.created_time ?? '0'),
          }))
        )
      )
    )
  }, [userId, JSON.stringify(leagueChatChannelIds), realtimeMessages?.length])

  useEffect(() => {
    if (!userId) return
    Promise.all(
      leagueChatChannelIds.map((channelId) =>
        run(getLastChatInChannelQuery(channelId, userId)).then(({ data }) =>
          setLastSeenChats((prev) => ({
            ...prev,
            [channelId]: tsToMillis(first(data)?.created_time ?? '0'),
          }))
        )
      )
    )
  }, [
    userId,
    JSON.stringify(leagueChatChannelIds),
    JSON.stringify(lastMessageTimes),
    JSON.stringify(unseenChats),
  ])
  useEffect(() => {
    setUnseenChats(
      filterDefined(
        leagueChatChannelIds.map((channelId) =>
          lastMessageTimes[channelId] > lastSeenChats[channelId]
            ? channelId
            : null
        )
      )
    )
  }, [JSON.stringify(lastMessageTimes), JSON.stringify(lastSeenChats)])
  return [unseenChats, setUnseenChats] as const
}
