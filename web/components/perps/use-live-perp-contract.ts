import { useEffect, useState } from 'react'

import { PerpContract } from 'common/contract'
import { api } from 'web/lib/api/api'
import { scheduleFreshBurst } from './use-perp-positions'

// Matches the scheduler's fast oracle tick. The scheduler writes directly and
// does not publish a websocket event, so PERP surfaces need a small poll.
const POLL_MS = 15_000

/**
 * Overlay the live oracle, pool, funding, and resolution fields onto an SSR
 * contract. The never-rewind guards keep a cached response from replacing a
 * newer point or resurrecting an already-settled market.
 */
export const useLivePerpContract = (ssrContract: PerpContract) => {
  const [live, setLive] = useState<Partial<PerpContract> | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    const poll = (fresh: boolean) =>
      api(
        'market/:id',
        { id: ssrContract.id, lite: true },
        fresh ? { cache: 'no-store' } : undefined
      )
        .then((market) => {
          if (
            cancelled ||
            market.outcomeType !== 'PERP' ||
            market.oraclePrice == null
          )
            return

          const resolution =
            market.resolution === 'MKT' || market.resolution === 'CANCEL'
              ? market.resolution
              : undefined
          setLive((previous) =>
            ((ssrContract.isResolved || previous?.isResolved) &&
              !market.isResolved) ||
            (market.oraclePriceTime ?? 0) <
              (previous?.oraclePriceTime ?? ssrContract.oraclePriceTime ?? 0)
              ? previous
              : {
                  oraclePrice: market.oraclePrice,
                  oraclePriceTime: market.oraclePriceTime,
                  oracleSourceTime: market.oracleSourceTime,
                  poolLong: market.poolLong,
                  poolShort: market.poolShort,
                  fundingRate: market.fundingRate,
                  volume: market.volume,
                  uniqueBettorCount: market.uniqueBettorCount,
                  isResolved: market.isResolved,
                  resolution,
                  resolutionTime: market.resolutionTime,
                  resolverId: market.resolverId,
                  resolvedOraclePrice: market.resolvedOraclePrice,
                  lastUpdatedTime: market.lastUpdatedTime,
                  ...(market.lastFundingTime != null
                    ? { lastFundingTime: market.lastFundingTime }
                    : {}),
                  // Admins can retune the leverage cap live
                  // (update-perp-config); the bet panel's clamp and slider
                  // marks key off it, so every open page must converge.
                  ...(market.maxLeverage != null
                    ? { maxLeverage: market.maxLeverage }
                    : {}),
                }
          )
        })
        .catch(() => {})

    // A trade-triggered refresh bursts past the market endpoint's stale cache
    // window. Ordinary embed/page updates stay on the light 15-second poll.
    const cancelBurst =
      refreshKey > 0
        ? scheduleFreshBurst(() => poll(true))
        : (poll(false), undefined)
    const interval = setInterval(() => poll(false), POLL_MS)
    return () => {
      cancelled = true
      cancelBurst?.()
      clearInterval(interval)
    }
  }, [
    ssrContract.id,
    ssrContract.isResolved,
    ssrContract.oraclePriceTime,
    refreshKey,
  ])

  const refresh = () => setRefreshKey((key) => key + 1)
  const contract =
    live && (live.oraclePriceTime ?? 0) >= (ssrContract.oraclePriceTime ?? 0)
      ? { ...ssrContract, ...live }
      : ssrContract

  return { contract, refresh, refreshKey }
}
