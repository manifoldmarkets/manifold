import { useEffect, useState } from 'react'
import { useEvent } from './use-event'
import { getWebsocketUrl } from 'common/api/utils'
import { ServerMessage } from 'common/api/websockets'
import { APIRealtimeClient } from 'common/api/websocket-client'

const client =
  typeof window !== 'undefined'
    ? new APIRealtimeClient(getWebsocketUrl())
    : undefined

export type SubscriptionOptions = {
  topics: string[]
  onBroadcast: (msg: ServerMessage<'broadcast'>) => void
  onError?: (err: Error) => void
  enabled?: boolean
  onSubscribed?: () => void
}

export function useApiSubscription(opts: SubscriptionOptions) {
  const onBroadcast = useEvent(opts.onBroadcast)
  const onSubscribed = useEvent(() => opts.onSubscribed?.())
  useEffect(() => {
    const ws = client
    if (ws != null && (opts.enabled ?? true)) {
      let active = true
      ws.subscribe(opts.topics, onBroadcast)
        .then(() => {
          if (active && ws.state === WebSocket.OPEN) onSubscribed()
        })
        .catch(opts.onError ?? console.error)
      return () => {
        active = false
        ws.unsubscribe(opts.topics, onBroadcast).catch(
          opts.onError ?? console.error
        )
      }
    }
  }, [opts.enabled, JSON.stringify(opts.topics)])
}

/** Connection generation, incremented after subscriptions are acknowledged.
 * Includes the first successful connection, which can follow a stale HTTP read. */
export function useWebsocketReconnectCount() {
  const [count, setCount] = useState(client?.reconnectCount ?? 0)

  useEffect(() => {
    if (client == null) return
    // A reconnect can happen between render and this effect running.
    setCount(client.reconnectCount)
    return client.onReconnect(setCount)
  }, [])

  return count
}
