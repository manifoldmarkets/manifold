import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { fromNow } from 'client-common/lib/time'
import { PerpContract } from 'common/contract'
import { PERPS_SKIP_ORACLE_FRESHNESS } from 'common/envs/constants'
import { nextFundingTimes } from 'common/perps/chart-projections'
import {
  fundingPeriodNoun,
  fundingPeriodUnit,
  getFundingPeriodMs,
  getPerpFundingRate,
} from 'common/perps/funding'
import {
  formatCountdown,
  formatPrice,
  inferPriceDecimals,
} from 'common/perps/format'
import { getOracleFreshness } from 'common/perps/oracle'
import { YEAR_MS } from 'common/util/time'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Tooltip } from 'web/components/widgets/tooltip'
import { useIsClient } from 'web/hooks/use-is-client'
import { PerpChart } from './perp-chart'
import { PerpBetPanel } from './perp-bet-panel'
import { PerpOracleAttribution } from './perp-oracle-attribution'
import { PerpPositionPanel } from './perp-position-panel'
import { useLivePerpContract } from './use-live-perp-contract'
import { usePerpPositions } from './use-perp-positions'

// Poll cadence for live market data. Matches the scheduler's fast tick;
// there are no websocket broadcasts for oracle updates (the engine runs in
// the scheduler process, not the API's socket server), so the page polls.
const POLL_MS = 15_000
const MAX_TIMEOUT_MS = 2_147_483_647

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

const useOracleFreshness = (contract: PerpContract) => {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    const update = () => setNow(Date.now())
    update()
    const staleAt =
      (contract.oraclePriceTime ?? Number.NaN) + contract.maxOraclePriceAgeMs
    const delay = staleAt - Date.now()
    const timeout =
      Number.isFinite(delay) && delay >= 0
        ? setTimeout(update, Math.min(delay + 1, MAX_TIMEOUT_MS))
        : undefined
    const interval = setInterval(update, POLL_MS)
    return () => {
      if (timeout !== undefined) clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [contract.oraclePriceTime, contract.maxOraclePriceAgeMs])

  return now == null
    ? null
    : getOracleFreshness(
        contract.oraclePriceTime,
        contract.maxOraclePriceAgeMs,
        now
      )
}

export const PerpOverview = (props: { contract: PerpContract }) => {
  const { contract, refresh, refreshKey } = useLivePerpContract(props.contract)
  const [chartMode, setChartMode] = useState<'price' | 'funding'>('price')
  // Single polled positions source shared by the chart overlays, position
  // panel, and bet panel — one request instead of three, and every consumer
  // sees cross-user changes on the poll rather than only on own-trades.
  const positions = usePerpPositions(contract.id, refreshKey)

  const price = Number(
    contract.isResolved
      ? contract.resolvedOraclePrice ?? contract.oraclePrice
      : contract.oraclePrice
  )
  const flash = useTickFlash(price)
  // Single-sample inference: integer prices (e.g. DAU counts) show 0
  // decimals, fractional prices scale to their magnitude.
  const priceDecimals = inferPriceDecimals([price])

  // Compute the funding rate live from the current open interest rather than
  // reading `contract.fundingRate`, which the scheduler only refreshes at
  // each funding event. Without this, a user who just moved the imbalance
  // would still see the previous period's rate — often with the opposite
  // sign — until the next funding tick, which reads as "backwards".
  const liveFundingRate = getPerpFundingRate(contract)
  const oracleFreshness = useOracleFreshness(contract)
  const oracleTradingPaused =
    !PERPS_SKIP_ORACLE_FRESHNESS &&
    oracleFreshness != null &&
    oracleFreshness.status !== 'fresh'

  return (
    <Col className="gap-4">
      <Row className="flex-wrap items-baseline justify-between gap-2">
        <Row className="min-w-0 items-baseline gap-4 sm:gap-8">
          <Col>
            <div className="text-ink-500 text-sm">
              {contract.isResolved ? 'Final oracle price' : 'Oracle price'}
            </div>
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
          {contract.isResolved ? (
            <Col>
              <div className="text-ink-500 text-sm">Status</div>
              <div className="text-ink-900 text-3xl font-semibold">Settled</div>
              <div className="text-ink-500 text-xs">Trading has ended</div>
            </Col>
          ) : (
            <FundingRateColumn
              rate={liveFundingRate}
              lastFundingTime={contract.lastFundingTime}
              fundingStartTime={contract.createdTime}
              fundingPeriodMs={getFundingPeriodMs(contract)}
            />
          )}
        </Row>
        <Row className="border-ink-200 ml-auto overflow-hidden rounded-md border">
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

      {!contract.isResolved && oracleTradingPaused && (
        <div
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100"
        >
          <div className="font-semibold">
            {oracleFreshness.status === 'stale'
              ? 'Oracle update delayed'
              : 'Oracle update unavailable'}
          </div>
          Trading and position closes are paused to prevent execution at an
          outdated price.{' '}
          {oracleFreshness.ageMs != null &&
          typeof contract.oraclePriceTime === 'number'
            ? `The last update arrived ${fromNow(contract.oraclePriceTime)}. `
            : 'No valid update timestamp is available. '}
          They resume automatically after the next valid update.
        </div>
      )}

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
        asOfTime={contract.oracleSourceTime}
      />

      {contract.isResolved ? (
        <div className="border-primary-200 bg-primary-50 text-ink-700 dark:bg-primary-900/20 rounded-lg border px-4 py-3 text-sm">
          <div className="text-ink-900 font-semibold">Market settled</div>
          All open positions were closed at the final oracle price of{' '}
          <span className="font-semibold tabular-nums">
            {formatPrice(price, priceDecimals)}
          </span>
          . Funding and trading have stopped.
        </div>
      ) : (
        <PerpBetPanel
          contract={contract}
          onTrade={refresh}
          positions={positions}
          oracleTradingPaused={oracleTradingPaused}
        />
      )}
      <PerpPositionPanel
        contract={contract}
        onAction={refresh}
        refreshKey={refreshKey}
        positions={positions}
        oracleTradingPaused={oracleTradingPaused}
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
