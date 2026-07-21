import { useEffect, useState } from 'react'
import { api } from 'web/lib/api/api'

// One polled source of truth for a perp market's open positions, shared by
// the chart overlays, position panel, bet panel, and holders tab.
//
// - Polls every POSITIONS_POLL_MS with normal HTTP caching: passive
//   staleness within the endpoint's max-age is fine, and the shared cache
//   sheds load at launch scale.
// - When `refreshKey` bumps (a trade/close just happened on this page), the
//   refetch bypasses the browser cache. The endpoint is served with
//   max-age + stale-while-revalidate, so a cached response can legally be
//   the PRE-trade state for several seconds — which mid-interaction reads
//   as "my trade didn't happen".
//
// Returns null until the first response so callers can distinguish
// "loading" from "no open positions".

export type PerpPositionRow = {
  userId: string
  direction: 'long' | 'short'
  size: number
  costBasis: number
  originalCostBasis: number
  entryPrice: number
  leverage: number
  liquidationPrice: number
  openedTime: number
  updatedTime: number
  userName: string | null
  username: string | null
  avatarUrl: string | null
}

export const POSITIONS_POLL_MS = 15_000

/**
 * Refetch burst for right after a mutation. `no-store` defeats the browser
 * cache, but the API also sits behind an edge cache (Cloudflare) that
 * serves `max-age=5, stale-while-revalidate=10` copies regardless of the
 * client's no-cache — an immediate refetch can legally return the
 * pre-mutation state. Refetching again at 2.5s and 7s rides past that
 * window. (The real fix — `no-cache` on the endpoints — is in the schema
 * and lands with the next API deploy; this burst keeps interactions crisp
 * against the currently deployed API.) Returns a cleanup.
 */
export const scheduleFreshBurst = (load: () => void) => {
  load()
  const t1 = setTimeout(load, 2500)
  const t2 = setTimeout(load, 7000)
  return () => {
    clearTimeout(t1)
    clearTimeout(t2)
  }
}

export const usePerpPositions = (contractId: string, refreshKey = 0) => {
  const [positions, setPositions] = useState<PerpPositionRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = (fresh: boolean) =>
      api(
        'get-perp-positions',
        { contractId },
        fresh ? { cache: 'no-store' } : undefined
      )
        .then((rows) => {
          if (cancelled) return
          setPositions(rows.filter((r) => r.size > 0))
        })
        .catch(() => {})
    const cancelBurst =
      refreshKey > 0
        ? scheduleFreshBurst(() => load(true))
        : (load(false), undefined)
    const id = setInterval(() => load(false), POSITIONS_POLL_MS)
    return () => {
      cancelled = true
      cancelBurst?.()
      clearInterval(id)
    }
  }, [contractId, refreshKey])

  return positions
}
