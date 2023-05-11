import { useEffect, useState } from 'react'
import { db } from 'web/lib/supabase/db'
import { ChatMessage } from 'common/chat-message'
import { run } from 'common/supabase/utils'
import { MINUTE_MS } from 'common/util/time'

export function useRealtimeChats(limit: number) {
  const [chats, setChats] = useState<ChatMessage[]>([])

  const convertSQLChatToChatMessage = (c: any): ChatMessage =>
    ({
      id: c.id,
      userId: c.user_id,
      channelId: c.channel_id,
      content: c.content,
      createdTime: new Date(c.created_time).valueOf(),
      userName: c.user_name,
      userAvatarUrl: c.user_avatar_url,
      userUsername: c.user_username,
    } as ChatMessage)
  useEffect(() => {
    const after = new Date(Date.now() - 100 * MINUTE_MS).toISOString()
    run(
      db
        .from('chat_messages')
        .select('*')
        .gte('created_time', after)
        .limit(limit)
    )
      .then((result) => {
        console.log('new chat', result)
        setChats(result.data.map((c) => convertSQLChatToChatMessage(c)))
      })
      .catch((e) => console.log(e))
  }, [])

  useEffect(() => {
    const channel = db.channel('live-chats')
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
      },
      (payload) => {
        if (payload) {
          const payloadComment = payload.new
          setChats((chats) => {
            if (
              payloadComment &&
              !chats.some((c) => c.id == payloadComment.id)
            ) {
              const comment = convertSQLChatToChatMessage(payloadComment)
              return [comment].concat(chats)
            } else {
              return chats
            }
          })
        }
      }
    )
    channel.subscribe(async (status) => {
      console.log('chat channel status', status)
    })
    return () => {
      db.removeChannel(channel)
    }
  }, [db])

  return chats
}
