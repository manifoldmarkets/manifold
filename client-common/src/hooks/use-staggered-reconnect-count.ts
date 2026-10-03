import { useEffect, useState } from 'react'
import { useWebsocketReconnectCount } from './use-api-subscription'

// Each client waits its own random time after a reconnect. It's longer than the
// CDN max-age of market, order and balance reads, so the snapshot a delayed read
// gets was cached after the reconnect. Every consumer on a page waits the same
// time, so their refetches land together and batched reads stay batched.
const DELAY_MS = 5_000 + Math.random() * 25_000

/** Counts websocket reconnects after the first connection, reporting each one
 * after this client's delay. Consumers that read through the CDN refetch on it,
 * so a websocket server restart doesn't make every client refetch at once. */
export function useStaggeredReconnectCount() {
  const reconnects = Math.max(0, useWebsocketReconnectCount() - 1)
  const [count, setCount] = useState(reconnects)

  useEffect(() => {
    if (reconnects === count) return
    const timer = setTimeout(() => setCount(reconnects), DELAY_MS)
    return () => clearTimeout(timer)
  }, [reconnects])

  return count
}
