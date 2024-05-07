import { useEffect } from 'react'
import { client } from 'web/lib/api/ws'
import { ServerMessage } from 'common/api/websockets'

export type SubscriptionOptions = {
  topics: string[]
  onBroadcast: (msg: ServerMessage<'broadcast'>) => void
}

export function useApiSubscription(opts: SubscriptionOptions) {
  useEffect(() => {
    client.subscribe(opts.topics, opts.onBroadcast)
    return () => {
      client.unsubscribe(opts.topics, opts.onBroadcast)
    }
  }, [])
}
