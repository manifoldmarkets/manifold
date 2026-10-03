import { maxCachedAgeMs } from 'common/api/cache'
import { API } from 'common/api/schema'
import { useEffect, useState } from 'react'
import { useWebsocketReconnectCount } from './use-api-subscription'

// Long enough that any cached response a delayed read gets was read from the
// origin after the connection: past the max age of every endpoint that display
// consumers read, with a margin.
const MIN_RECONNECT_DELAY_MS =
  Math.max(
    maxCachedAgeMs(API.bets.cache),
    maxCachedAgeMs(API['markets-by-ids'].cache)
  ) + 4_000
// Each client waits its own random time, so a websocket server restart doesn't
// make every client refetch at once. Every consumer on a page waits the same
// time, so their refetches land together and batched reads stay batched.
const DELAY_MS = MIN_RECONNECT_DELAY_MS + Math.random() * 25_000

/** The websocket connection count, with each change reported after this
 * client's delay. It starts from the count at mount, so a consumer that read
 * before a connection was established, including the first, refetches once
 * after it. Consumers that read through the CDN refetch on it. */
export function useStaggeredReconnectCount() {
  const connections = useWebsocketReconnectCount()
  const [count, setCount] = useState(connections)

  useEffect(() => {
    if (connections === count) return
    const timer = setTimeout(() => setCount(connections), DELAY_MS)
    return () => clearTimeout(timer)
  }, [connections])

  return count
}
