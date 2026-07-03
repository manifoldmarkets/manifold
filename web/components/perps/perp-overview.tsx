import { useEffect, useState } from 'react'
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

// Funding events fire hourly in the engine (FUNDING_PERIOD_MS = HOUR_MS), so
// the per-period rate stored on the contract annualizes as rate * 24 * 365.
const FUNDING_PERIODS_PER_YEAR = 24 * 365

// Poll cadence for the live oracle price. Matches the scheduler's fast tick;
// there are no websocket broadcasts for oracle updates (the engine runs in
// the scheduler process, not the API's socket server), so the page polls.
const PRICE_POLL_MS = 15_000

// Overlay the latest oracle point onto the SSR contract so the price header,
// bet panel, and position PnL track the feed without a page reload. Never
// rewind: an older cached response must not beat the SSR snapshot.
const useLiveOraclePrice = (contract: PerpContract) => {
  const [latest, setLatest] = useState<{ price: number; ts: number } | null>(
    null
  )
  useEffect(() => {
    let cancelled = false
    const tick = () =>
      api('get-oracle-price', { feedId: contract.oracleFeedId })
        .then((res) => {
          if (!cancelled && res.latest) setLatest(res.latest)
        })
        .catch(() => {})
    tick()
    const id = setInterval(tick, PRICE_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [contract.oracleFeedId])

  if (!latest || latest.ts <= (contract.oraclePriceTime ?? 0)) return contract
  return {
    ...contract,
    oraclePrice: latest.price,
    oraclePriceTime: latest.ts,
  }
}

export const PerpOverview = (props: { contract: PerpContract }) => {
  const contract = useLiveOraclePrice(props.contract)
  const [chartMode, setChartMode] = useState<'price' | 'funding'>('price')

  const price = Number(contract.oraclePrice)
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
            <div className="text-3xl font-semibold">
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

      <PerpChart contract={contract} mode={chartMode} />

      <PerpBetPanel contract={contract} />
      <PerpPositionPanel contract={contract} />
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
