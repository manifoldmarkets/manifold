import { useEffect, useState } from 'react'
import { PerpContract } from 'common/contract'
import { PERPS_SKIP_ORACLE_FRESHNESS } from 'common/envs/constants'
import { getPerpOracleFreshness } from 'common/perps/oracle'
import { ORACLE_HEALTH_MAX_AGE_MS } from 'common/perps/oracle-health'

const FRESHNESS_CLOCK_MS = 15_000
const MAX_TIMEOUT_MS = 2_147_483_647

/** Shared execution gate for market pages and quick-bet modals. */
export const usePerpTradingStatus = (contract: PerpContract) => {
  // Defer wall-clock state until hydration, then update at the exact expiry
  // as well as periodically while the market remains on screen.
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    const update = () => setNow(Date.now())
    update()
    const sourceStaleAt =
      (contract.oraclePriceTime ?? Number.NaN) + contract.maxOraclePriceAgeMs
    const staleAt = contract.oracleFeedHealth
      ? Math.min(
          sourceStaleAt,
          contract.oracleFeedHealth.checkedAt + ORACLE_HEALTH_MAX_AGE_MS,
          contract.oracleFeedHealth.expiresAt ?? 0
        )
      : sourceStaleAt
    const delay = staleAt - Date.now()
    const timeout =
      Number.isFinite(delay) && delay >= 0
        ? setTimeout(update, Math.min(delay + 1, MAX_TIMEOUT_MS))
        : undefined
    const interval = setInterval(update, FRESHNESS_CLOCK_MS)
    return () => {
      if (timeout !== undefined) clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [
    contract.oraclePriceTime,
    contract.maxOraclePriceAgeMs,
    contract.oracleFeedId,
    contract.oracleFeedHealth?.checkedAt,
    contract.oracleFeedHealth?.expiresAt,
  ])

  const oracleFreshness =
    now == null ? null : getPerpOracleFreshness(contract, now)
  // A solvency halt can retain a fresh oracle mark, so it must be checked
  // independently of oracle freshness and its development override.
  const solvencyHalted = contract.solvencyHaltTime != null
  const oracleTradingPaused =
    solvencyHalted ||
    (!PERPS_SKIP_ORACLE_FRESHNESS &&
      oracleFreshness != null &&
      oracleFreshness.status !== 'fresh')

  return { oracleFreshness, solvencyHalted, oracleTradingPaused }
}
