import { db } from 'web/lib/supabase/db'
import { ChatMessage } from 'common/chat-message'
import { mapTypes, Row, run, tsToMillis } from 'common/supabase/utils'
import { useSubscription } from 'web/lib/supabase/realtime/use-subscription'
import { useEffect, useState } from 'react'
import { first, last } from 'lodash'

export const getChatMessages = async (channelId: string, limit: number) => {
  const { data } = await run(
    db
      .from('chat_messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_time', { ascending: false })
      .limit(limit)
  )
  return data
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

export const useHasUnseenLeagueChat = (
  channelId: string,
  userId: string | undefined
) => {
  const [lastSeenChat, setLastSeenChat] = useState<number>()
  const [unseen, setUnseen] = useState(true)
  const chats = useRealtimeChatsOnLeague(channelId, 1)
  useEffect(() => {
    if (!userId || !channelId) return
    run(
      db
        .from('user_seen_chats')
        .select('created_time')
        .eq('user_id', userId)
        .eq('channel_id', channelId)
        .order('created_time', { ascending: false })
        .limit(1)
    ).then(({ data }) =>
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
