import { db } from 'web/lib/supabase/db'
import { orderBy, uniqBy } from 'lodash'
import { usePersistentLocalState } from './use-persistent-local-state'
import { useEffect, useRef } from 'react'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { ChatMessage, convertPublicChatMessage } from 'common/chat-message'

export function usePublicChat(channelId: string, limit: number) {
  const generation = useRef(0)
  const [messages, setMessages] = usePersistentLocalState<
    ChatMessage[] | undefined
  >(undefined, `public-chat-messages-${limit}-v2-${channelId}`)

  const [newestId, setNewestId] = usePersistentLocalState<number | undefined>(
    undefined,
    `public-chat-newest-id`
  )

  const fetchMessages = async () => {
    const request = ++generation.current
    const { data } = await db
      .from('chat_messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_time', { ascending: false })
      .gt('id', newestId ?? 0)
      .limit(limit)

    if (request !== generation.current) return
    if (data) {
      const newMessages = data.map(convertPublicChatMessage)
      setMessages((prevMessages) =>
        orderBy(
          uniqBy([...newMessages, ...(prevMessages ?? [])], (m) => m.id),
          'createdTime',
          'desc'
        )
      )

      if (data.length > 0) setNewestId(data[0].id)
    }
  }

  useEffect(() => {
    fetchMessages().catch(console.error)
    return () => {
      generation.current++
    }
  }, [channelId, limit])

  useApiSubscription({
    topics: ['public-chat'],
    recoveryKey: `${channelId}-${limit}`,
    getSnapshot: async (signal) => {
      const request = ++generation.current
      const { data, error } = await db
        .from('chat_messages')
        .select('*')
        .eq('channel_id', channelId)
        .order('created_time', { ascending: false })
        .limit(limit)
        .abortSignal(signal)
      if (error) throw error
      return () => {
        if (request !== generation.current) return false
        setMessages((previous) =>
          orderBy(
            uniqBy(
              [...data.map(convertPublicChatMessage), ...(previous ?? [])],
              'id'
            ),
            'createdTime',
            'desc'
          )
        )
        if (data.length) setNewestId(data[0].id)
      }
    },
    onBroadcast: () => {
      fetchMessages().catch(console.error)
    },
  })

  return messages
}
