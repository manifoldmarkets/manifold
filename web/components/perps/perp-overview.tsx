import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { PerpContract } from 'common/contract'
import { computeFundingRate } from 'common/perps/amm'
import { nextFundingTimes } from 'common/perps/chart-projections'
import {
  fundingPeriodNoun,
  fundingPeriodUnit,
  getFundingPeriodMs,
} from 'common/perps/funding'
import {
  formatCountdown,
  formatPrice,
  inferPriceDecimals,
} from 'common/perps/format'
import { YEAR_MS } from 'common/util/time'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Tooltip } from 'web/components/widgets/tooltip'
import { useIsClient } from 'web/hooks/use-is-client'
import { api } from 'web/lib/api/api'
import { PerpChart } from './perp-chart'
import { PerpBetPanel } from './perp-bet-panel'
import { PerpOracleAttribution } from './perp-oracle-attribution'
import { PerpPositionPanel } from './perp-position-panel'
import { scheduleFreshBurst, usePerpPositions } from './use-perp-positions'

// Poll cadence for live market data. Matches the scheduler's fast tick;
// there are no websocket broadcasts for oracle updates (the engine runs in
// the scheduler process, not the API's socket server), so the page polls.
const POLL_MS = 15_000

// Overlay live perp fields (oracle price, pools, funding, volume) onto the
// SSR contract so every number on the page tracks the feed without a reload.
// Returns a refresh() that re-polls immediately and bumps refreshKey — call
// it after any trade/close so the user's own action is reflected instantly.
// The post-trade poll bypasses the browser cache: market/:id is served with
// max-age + stale-while-revalidate, so a cached response can legally carry
// the pre-trade pools for several seconds. Never rewind the price: a cached
// response must not beat a newer snapshot.
// Exported for the perp tabs (holders/trades), which mount outside this
// component but want the same liveness.
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
        .then((m: any) => {
          if (cancelled || m.oraclePrice == null) return
          setLive((prev) =>
            (m.oraclePriceTime ?? 0) < (prev?.oraclePriceTime ?? 0)
              ? prev
              : {
                  oraclePrice: m.oraclePrice,
                  oraclePriceTime: m.oraclePriceTime,
                  poolLong: m.poolLong,
                  poolShort: m.poolShort,
                  fundingRate: m.fundingRate,
                  volume: m.volume,
                  uniqueBettorCount: m.uniqueBettorCount,
                  // Keeps the next-funding countdown honest after an
                  // on-page funding event. Missing on older API builds.
                  ...(m.lastFundingTime != null
                    ? { lastFundingTime: m.lastFundingTime }
                    : {}),
                }
          )
        })
        .catch(() => {})
    // Post-trade: burst past the edge cache's stale window (see
    // scheduleFreshBurst) so pools/funding reflect the trade promptly. The
    // never-rewind guard above drops any stale copy that arrives late.
    const cancelBurst =
      refreshKey > 0
        ? scheduleFreshBurst(() => poll(true))
        : (poll(false), undefined)
    const id = setInterval(() => poll(false), POLL_MS)
    return () => {
      cancelled = true
      cancelBurst?.()
      clearInterval(id)
    }
    // refreshKey in deps: refresh() restarts the interval with an immediate
    // cache-bypassing poll.
  }, [ssrContract.id, refreshKey])

  const refresh = () => setRefreshKey((k) => k + 1)

  const contract =
    live && (live.oraclePriceTime ?? 0) >= (ssrContract.oraclePriceTime ?? 0)
      ? { ...ssrContract, ...live }
      : ssrContract
  return { contract, refresh, refreshKey }
}

// Exchange-style tick flash: returns 'up' | 'down' for ~700ms after the
// value changes, so the price header can pulse green/red like a real book.
const useTickFlash = (value: number) => {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)
  const prev = useRef(value)
  useEffect(() => {
    if (value === prev.current) return
    setFlash(value > prev.current ? 'up' : 'down')
    prev.current = value
    const t = setTimeout(() => setFlash(null), 700)
    return () => clearTimeout(t)
  }, [value])
  return flash
}

export const PerpOverview = (props: { contract: PerpContract }) => {
  const { contract, refresh, refreshKey } = useLivePerpContract(props.contract)
  const [chartMode, setChartMode] = useState<'price' | 'funding'>('price')
  // Single polled positions source shared by the chart overlays, position
  // panel, and bet panel — one request instead of three, and every consumer
  // sees cross-user changes on the poll rather than only on own-trades.
  const positions = usePerpPositions(contract.id, refreshKey)

  const price = Number(contract.oraclePrice)
  const flash = useTickFlash(price)
  // Single-sample inference: integer prices (e.g. DAU counts) show 0
  // decimals, fractional prices scale to their magnitude.
  const priceDecimals = inferPriceDecimals([price])

  // Compute the funding rate live from the current pool balances rather than
  // reading `contract.fundingRate`, which the scheduler only refreshes at
  // each funding event. Without this, a user who just flipped the pool balance would
  // still see the previous period's rate — often with the opposite sign —
  // until the next funding tick, which reads as "backwards".
  const liveFundingRate = computeFundingRate(
    contract.poolLong,
    contract.poolShort,
    contract.fundingSensitivity,
    contract.maxFundingRate
  )

  return (
    <Col className="gap-4">
      <Row className="items-baseline justify-between">
        <Row className="items-baseline gap-8">
          <Col>
            <div className="text-ink-500 text-sm">Oracle price</div>
            <div
              className={clsx(
                'text-3xl font-semibold tabular-nums transition-colors duration-700',
                flash === 'up' && 'text-teal-500 duration-0',
                flash === 'down' && 'text-scarlet-500 duration-0'
              )}
            >
              {formatPrice(price, priceDecimals)}
            </div>
          </Col>
          <FundingRateColumn
            rate={liveFundingRate}
            lastFundingTime={contract.lastFundingTime}
            fundingStartTime={contract.createdTime}
            fundingPeriodMs={getFundingPeriodMs(contract)}
          />
        </Row>
        <Row className="border-ink-200 overflow-hidden rounded-md border">
          <button
            className={`px-3 py-1 text-sm ${
              chartMode === 'price'
                ? 'bg-primary-500 text-white'
                : 'text-ink-700'
            }`}
            onClick={() => setChartMode('price')}
          >
            Price
          </button>
          <button
            className={`px-3 py-1 text-sm ${
              chartMode === 'funding'
                ? 'bg-primary-500 text-white'
                : 'text-ink-700'
            }`}
            onClick={() => setChartMode('funding')}
          >
            Funding
          </button>
        </Row>
      </Row>

      <PerpChart contract={contract} mode={chartMode} positions={positions} />
      {/* Source credit for the feed — kept out of the market description so a
          licence credit can't be edited away. See
          common/perps/oracle-attribution.
          Note: like everything below the price header on this page, this is
          client-rendered, not in the SSR html. Fine for readers, but it does
          mean the credit is absent for anything reading raw HTML. Fixing that
          means restructuring the page, not moving this line — it renders no
          earlier inside PerpChart. */}
      <PerpOracleAttribution
        feedId={contract.oracleFeedId}
        asOfTime={contract.oraclePriceTime}
      />

      <PerpBetPanel
        contract={contract}
        onTrade={refresh}
        positions={positions}
      />
      <PerpPositionPanel
        contract={contract}
        onAction={refresh}
        refreshKey={refreshKey}
        positions={positions}
      />
    </Col>
  )
}

const FundingRateColumn = (props: {
  rate: number | undefined
  lastFundingTime: number | undefined
  fundingStartTime: number
  fundingPeriodMs: number
}) => {
  const { rate, lastFundingTime, fundingStartTime, fundingPeriodMs } = props
  // Client-only: the countdown is Date.now()-derived, so the server's
  // render goes stale by hydration time whenever a minute boundary passes
  // in between — a 1-in-60 hydration mismatch per hard load.
  const isClient = useIsClient()
  // No funding event has fired yet (brand-new contract): show a placeholder
  // so the column still aligns with Oracle price, rather than collapsing
  // the row layout.
  if (rate == null) {
    return (
      <Col>
        <div className="text-ink-500 text-sm">Funding</div>
        <div className="text-ink-400 text-3xl font-semibold">—</div>
      </Col>
    )
  }

  // Funding is a per-period cash flow viewed on a chart read in the same
  // units — lead with the per-period rate and who pays whom. The annualized
  // number reads as apocalyptic (±500%/yr) while the per-period reality is
  // a rounding error; it lives in the tooltip for the finance-brained.
  const periodPct = rate * 100
  const annualPct = rate * (YEAR_MS / fundingPeriodMs) * 100
  const sign = rate > 0 ? '+' : ''
  const directionText =
    rate > 0 ? 'longs pay shorts' : rate < 0 ? 'shorts pay longs' : 'balanced'
  const nextEvent = nextFundingTimes(
    lastFundingTime,
    Date.now(),
    1,
    fundingPeriodMs,
    fundingStartTime
  )[0]
  const countdown =
    isClient && nextEvent ? formatCountdown(nextEvent - Date.now()) : null
  const color =
    rate > 0
      ? 'text-scarlet-600 dark:text-scarlet-400'
      : rate < 0
      ? 'text-teal-600 dark:text-teal-400'
      : 'text-ink-500'

  return (
    <Tooltip
      text={
        <div className="max-w-[18rem] text-left">
          <div className="font-medium">
            Every {fundingPeriodNoun(fundingPeriodMs)}, the crowded side pays
            the thin side this fraction of its margin.
          </div>
          <div className="text-ink-200 mt-1 text-xs">
            Annualized: {sign}
            {annualPct.toFixed(0)}%/yr.
          </div>
        </div>
      }
    >
      <Col>
        <div className="text-ink-500 text-sm">Funding</div>
        <div className={`text-3xl font-semibold tabular-nums ${color}`}>
          {sign}
          {periodPct.toFixed(3)}%
          <span className="text-ink-400 text-base font-normal">
            /{fundingPeriodUnit(fundingPeriodMs)}
          </span>
        </div>
        <div className="text-ink-500 text-xs">
          {directionText}
          {countdown != null && ` · next in ${countdown}`}
        </div>
      </Col>
    </Tooltip>
  )
}
