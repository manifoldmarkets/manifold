import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { PerpContract } from 'common/contract'
import { computeFundingRate } from 'common/perps/amm'
import { formatPrice, inferPriceDecimals } from 'common/perps/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Tooltip } from 'web/components/widgets/tooltip'
import { api } from 'web/lib/api/api'
import { PerpChart } from './perp-chart'
import { PerpBetPanel } from './perp-bet-panel'
import { PerpPositionPanel } from './perp-position-panel'
import { scheduleFreshBurst, usePerpPositions } from './use-perp-positions'

// Funding events fire hourly in the engine (FUNDING_PERIOD_MS = HOUR_MS), so
// the per-period rate stored on the contract annualizes as rate * 24 * 365.
const FUNDING_PERIODS_PER_YEAR = 24 * 365

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
  // reading `contract.fundingRate`, which is only refreshed hourly by the
  // scheduler. Without this, a user who just flipped the pool balance would
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
          <FundingRateColumn rate={liveFundingRate} />
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

const FundingRateColumn = (props: { rate: number | undefined }) => {
  const { rate } = props
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

  const annualPct = rate * FUNDING_PERIODS_PER_YEAR * 100
  const hourlyPct = Math.abs(rate) * 100
  const sign = rate > 0 ? '+' : ''
  const payerText =
    rate > 0
      ? `Longs pay shorts ${hourlyPct.toFixed(4)}%/hour.`
      : rate < 0
      ? `Shorts pay longs ${hourlyPct.toFixed(4)}%/hour.`
      : 'No funding transfer this period.'
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
          <div className="font-medium">Annualized funding rate.</div>
          <div className="text-ink-200 mt-1 text-xs">{payerText}</div>
        </div>
      }
    >
      <Col>
        <div className="text-ink-500 text-sm">Funding</div>
        <div className={`text-3xl font-semibold tabular-nums ${color}`}>
          {sign}
          {annualPct.toFixed(2)}%
        </div>
      </Col>
    </Tooltip>
  )
}
