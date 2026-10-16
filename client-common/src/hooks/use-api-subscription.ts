import { useEffect } from 'react'
import { getWebsocketUrl } from 'common/api/utils'
import { ServerMessage } from 'common/api/websockets'
import { APIRealtimeClient } from 'common/api/websocket-client'
import {
  RecoverySnapshot,
  SubscriptionRecovery,
} from 'common/api/subscription-recovery'
import { useEvent } from './use-event'

const client =
  typeof window !== 'undefined'
    ? new APIRealtimeClient(getWebsocketUrl())
    : undefined

export type SubscriptionOptions = {
  topics: string[]
  onBroadcast: (msg: ServerMessage<'broadcast'>) => void
  onError?: (err: Error) => void
  enabled?: boolean
  getSnapshot?: RecoverySnapshot
  // Ephemeral commands and diagnostic event logs have no retained server state.
  recovery?: 'event-only'
  recoveryKey?: string
}

export function useApiSubscription(opts: SubscriptionOptions) {
  const onBroadcast = useEvent(opts.onBroadcast)
  const getSnapshot = useEvent(opts.getSnapshot)
  const onError = useEvent(opts.onError ?? console.error)
  useEffect(() => {
    const ws = client
    if (ws != null && (opts.enabled ?? true)) {
      const recovery = opts.getSnapshot
        ? new SubscriptionRecovery(getSnapshot, onError)
        : undefined
      const stopListening = ws.onConnectionChange((connected) =>
        recovery?.connectionChanged(connected)
      )
      const broadcast = (msg: ServerMessage<'broadcast'>) => {
        recovery?.broadcast()
        onBroadcast(msg)
      }
      let active = true
      ws.subscribe(opts.topics, broadcast)
        .then(() => {
          // A view may mount or change filters after the reconnect completed.
          // Refresh its retained state too, once its own subscription is ready.
          // This can add one read alongside its ordinary mount fetch, which may
          // be cached or incremental and cannot establish a fresh snapshot.
          if (active && ws.isReady && ws.recoveryEpoch > 0)
            recovery?.connectionChanged(true)
        })
        .catch(onError)
      return () => {
        active = false
        recovery?.stop()
        stopListening()
        ws.unsubscribe(opts.topics, broadcast).catch(onError)
      }
    }
  }, [opts.enabled, JSON.stringify(opts.topics), opts.recoveryKey])
}
