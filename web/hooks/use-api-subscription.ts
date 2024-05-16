import { useEffect } from 'react'
import { client } from 'web/lib/api/ws'
import { ServerMessage } from 'common/api/websockets'

export type SubscriptionOptions = {
  topics: string[]
  onBroadcast: (msg: ServerMessage<'broadcast'>) => void
  onError?: (err: Error) => void
  enabled?: boolean
}

export function useApiSubscription(opts: SubscriptionOptions) {
  useEffect(() => {
    if (opts.enabled ?? true) {
      client.subscribe(opts.topics, opts.onBroadcast).catch(opts.onError)
      return () => {
        client.unsubscribe(opts.topics, opts.onBroadcast).catch(opts.onError)
      }
    }
  }, [opts.enabled])
  return client.state
}
