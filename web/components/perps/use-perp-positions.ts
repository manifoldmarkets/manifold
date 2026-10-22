import { useEffect, useState } from 'react'

import { assertPerpPositionNumbers } from 'common/perps/amm'
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
// Returns `{ positions, unsound }`. `positions` is null until the first
// response so callers can distinguish "loading" from "no open positions";
// `unsound` carries rows that failed row-level sanity, which no consumer may
// render but the bet panel must know about (see the filter below).

export type PerpPositionRow = {
  userId: string
  direction: 'long' | 'short'
  size: number
  costBasis: number
  originalCostBasis: number
  takerFeeCostBasis: number
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

/**
 * STRUCTURAL sanity only — shares assertPerpPositionNumbers with the engine,
 * so "sound" means the same thing on both sides of the wire.
 *
 * Deliberately says nothing about whether the position is OPEN. The two
 * questions have to stay separate: a cleanly closed row (size, costBasis and
 * leverage all 0) is perfectly sound but not active, while a row carrying
 * margin at size 0 is active-looking but corrupt — and folding "size > 0"
 * into this predicate makes those two indistinguishable, which is how the
 * zero-with-margin row ended up in neither bucket below.
 */
export const isStructurallySoundPositionRow = (row: PerpPositionRow) => {
  try {
    assertPerpPositionNumbers({ ...row, contractId: '' })
  } catch {
    return false
  }
  return true
}

export const usePerpPositions = (contractId: string, refreshKey = 0) => {
  const [state, setState] = useState<{
    positions: PerpPositionRow[]
    unsound: PerpPositionRow[]
  } | null>(null)

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
          // Rows that fail row-level sanity are kept OUT of `positions` (no
          // consumer can render or price against them) but are NOT discarded:
          // the engine refuses to trade for a user who holds one
          // (assertUserPerpRowsSound), so the bet panel has to know the row
          // exists or it would preview a cheerful fresh-open quote for a
          // trade that is guaranteed to 500. A plain `size > 0` filter hides
          // exactly the malformed sizes — NaN, negative, zero-with-margin —
          // that the engine rejects on.
          setState({
            // Renderable: structurally sound AND actually open.
            positions: rows.filter(
              (r) => isStructurallySoundPositionRow(r) && r.size > 0
            ),
            // Corrupt: structurally unsound, whatever its size. The size is
            // not a filter here — the engine rejects on structure alone
            // (assertUserPerpRowsSound scans every row the user holds,
            // ignoring size for exactly this reason), so any size-based
            // exclusion would hide a row the engine will refuse to trade on.
            unsound: rows.filter((r) => !isStructurallySoundPositionRow(r)),
          })
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

  // `positions` stays null until the first response so callers can tell
  // "loading" from "no open positions"; `unsound` is empty in both cases.
  return { positions: state?.positions ?? null, unsound: state?.unsound ?? [] }
}
