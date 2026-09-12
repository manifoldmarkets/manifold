import { useEffect, useState } from 'react'
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
}

export function useApiSubscription(opts: SubscriptionOptions) {
  useEffect(() => {
    const ws = client
    if (ws != null && (opts.enabled ?? true)) {
      ws.subscribe(opts.topics, opts.onBroadcast).catch(opts.onError)
      return () => {
        ws.unsubscribe(opts.topics, opts.onBroadcast).catch(opts.onError)
      }
    }
  }, [opts.enabled, JSON.stringify(opts.topics)])
}

/** Counts how many times the websocket has come back after dropping. Add it to
 * a fetch effect's dependencies to reconcile after an outage: we resubscribe on
 * reconnect but the broadcasts sent while we were away are gone for good, so
 * cached server state is silently stale until something refetches it. Costs one
 * request per reconnect, not per message. */
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
