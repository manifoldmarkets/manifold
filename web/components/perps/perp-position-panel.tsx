import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { PerpContract } from 'common/contract'
import { nextFundingTimes } from 'common/perps/chart-projections'
import {
  fundingPeriodUnit,
  getFundingPeriodMs,
  getPerpFundingRate,
} from 'common/perps/funding'
import {
  fundingPerPeriod,
  getUserFacingPnl,
  getUserFacingPnlPercent,
} from 'common/perps/pnl'
import { PerpPosition } from 'common/perps/position'
import { DAY_MS } from 'common/util/time'
import {
  formatCountdown,
  formatPrice,
  inferPriceDecimals,
} from 'common/perps/format'
import {
  formatMoney,
  formatMoneyPrecise,
  MONEY_PRECISE_DUST,
} from 'common/util/format'
import { randomString } from 'common/util/random'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { api } from 'web/lib/api/api'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { PerpPositionRow, scheduleFreshBurst } from './use-perp-positions'

type Position = {
  userId: string
  direction: 'long' | 'short'
  size: number
  costBasis: number
  originalCostBasis: number
  takerFeeCostBasis: number
  entryPrice: number
  leverage: number
  liquidationPrice: number
}

export const PerpPositionPanel = (props: {
  contract: PerpContract
  // Called after closing a position so the page re-polls pools immediately.
  onAction?: () => void
  // Bumped by the parent after any trade elsewhere on the page (e.g. the bet
  // panel) so the tombstone events refetch without waiting for a poll tick.
  refreshKey?: number
  // Shared polled positions from the parent (usePerpPositions). Null while
  // loading.
  positions?: PerpPositionRow[] | null
  oracleTradingPaused?: boolean
}) => {
  const { contract, onAction, refreshKey, oracleTradingPaused = false } = props
  const user = useUser()
  // Optimistic close: the API confirmed the close, but the shared positions
  // refetch can lag behind an edge cache for several seconds — don't keep
  // rendering a position we know is gone. Keyed by close time vs the row's
  // openedTime so a position re-opened moments later isn't hidden.
  const [closedAt, setClosedAt] = useState<{ [dir: string]: number }>({})
  const positions = useMemo(
    () =>
      user && props.positions
        ? props.positions.filter(
            (p) =>
              p.userId === user.id &&
              !(closedAt[p.direction] && p.openedTime < closedAt[p.direction])
          )
        : [],
    [props.positions, user?.id, closedAt]
  )
  const [closing, setClosing] = useState<'long' | 'short' | null>(null)
  const pendingCloses = useRef<
    Partial<
      Record<'long' | 'short', { fingerprint: string; idempotencyKey: string }>
    >
  >({})
  const [refresh, setRefresh] = useState(0)
  // Terminal events for the tombstone section: a liquidated or fully
  // auto-deleveraged position must NOT silently vanish from the page.
  const [pastEvents, setPastEvents] = useState<PerpHistoryEvent[]>([])

  useEffect(() => {
    if (!user) {
      setPastEvents([])
      return
    }
    let cancelled = false
    // After an action on this page, refetch cache-bypassed and burst past
    // the edge cache's stale window — otherwise a fresh close's tombstone
    // lags several seconds behind the toast.
    const fresh = (refresh ?? 0) > 0 || (refreshKey ?? 0) > 0
    const load = () =>
      api(
        'get-perp-events',
        {
          contractId: contract.id,
          userId: user.id,
          limit: 20,
        },
        fresh ? { cache: 'no-store' } : undefined
      )
        .then((events) => {
          if (cancelled) return
          setPastEvents(
            events.filter(
              (e) =>
                e.eventType === 'close' ||
                e.eventType === 'liquidation' ||
                (e.eventType === 'adl' && e.payout != null)
            )
          )
        })
        .catch(() => {})
    const cancelBurst = fresh ? scheduleFreshBurst(load) : (load(), undefined)
    return () => {
      cancelled = true
      cancelBurst?.()
    }
  }, [contract.id, contract.resolutionTime, user?.id, refresh, refreshKey])

  if (!user) return null
  if (!positions.length && !pastEvents.length) return null

  const close = async (direction: 'long' | 'short') => {
    if (oracleTradingPaused) {
      toast.error('Closing is paused until the oracle publishes a fresh price')
      return
    }
    setClosing(direction)
    try {
      const position = positions.find((p) => p.direction === direction)
      if (!position) throw new Error('Position is no longer open')
      const fingerprint = [contract.id, direction, position.openedTime].join(
        ':'
      )
      const request =
        pendingCloses.current[direction]?.fingerprint === fingerprint
          ? pendingCloses.current[direction]
          : { fingerprint, idempotencyKey: randomString() }
      pendingCloses.current[direction] = request
      const res = await api('close-perp-position', {
        contractId: contract.id,
        direction,
        idempotencyKey: request.idempotencyKey,
        expectedOpenedTime: position.openedTime,
      })
      toast.success(
        `Closed ${direction} — payout ${formatMoneyPrecise(
          res.payout
        )} (profit ${formatMoneyPrecise(res.pnl)})`
      )
      track('sell shares', {
        outcomeType: contract.outcomeType,
        slug: contract.slug,
        contractId: contract.id,
        shares: position?.size,
        outcome: direction,
        token: contract.token,
        perpAction: 'close',
        payout: res.payout,
        pnl: res.pnl,
      })
      setClosedAt((prev) => ({ ...prev, [direction]: Date.now() }))
      setRefresh((r) => r + 1)
      delete pendingCloses.current[direction]
      // Pools changed; let the page re-poll the contract immediately.
      onAction?.()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Close failed')
    } finally {
      setClosing(null)
    }
  }

  return (
    <Col className="gap-3">
      {positions.map((p) => (
        <PositionCard
          key={p.direction}
          position={p}
          contract={contract}
          onClose={() => close(p.direction)}
          closing={closing === p.direction}
          anyClosing={closing !== null}
          oracleTradingPaused={oracleTradingPaused}
        />
      ))}
      {pastEvents.length > 0 && <PositionHistory events={pastEvents} />}
    </Col>
  )
}

type PerpHistoryEvent = {
  id: number
  ts: number
  eventType: 'open' | 'add' | 'close' | 'liquidation' | 'adl' | 'funding'
  direction: 'long' | 'short' | null
  sizeDelta: number
  originalCostBasisDelta: number
  oraclePrice: number
  payout: number | null
  pnl: number | null
}

// Tombstones for closed/liquidated positions, so the outcome of a position
// stays visible on the market page instead of the position just vanishing.
// Shows the 5 most recent by default with an explicit count — an unlabeled
// short list reads as "this is everything".
const HISTORY_PREVIEW_COUNT = 5

const PositionHistory = (props: { events: PerpHistoryEvent[] }) => {
  const { events: allEvents } = props
  const [expanded, setExpanded] = useState(false)
  const events = expanded
    ? allEvents
    : allEvents.slice(0, HISTORY_PREVIEW_COUNT)
  const hasMore = allEvents.length > HISTORY_PREVIEW_COUNT
  return (
    <Col className="border-ink-200 bg-canvas-0 gap-2 rounded-lg border p-3">
      <Row className="items-baseline justify-between">
        <span className="text-ink-500 text-xs font-semibold uppercase">
          Your position history
        </span>
        {/* Caption only when rows are actually held back — "last 1" on a
            complete one-row list reads as if something is hidden. */}
        {hasMore && (
          <span className="text-ink-400 text-xs">
            {expanded
              ? `all ${allEvents.length}`
              : `last ${events.length} of ${allEvents.length}`}
          </span>
        )}
      </Row>
      {events.map((e) => {
        const decimals = inferPriceDecimals([e.oraclePrice])
        const at = new Date(e.ts).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
        if (e.eventType === 'liquidation') {
          // originalCostBasisDelta is negative on liquidation; the loss is
          // the full margin that was forfeited to the pool.
          const lost = Math.abs(e.originalCostBasisDelta)
          return (
            <Row
              key={e.id}
              className="flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm"
            >
              <span className="text-scarlet-600 font-semibold">
                💥 Liquidated {e.direction}
              </span>
              <span className="text-scarlet-600 font-semibold tabular-nums">
                −{formatMoneyPrecise(lost)} margin
              </span>
              <span className="text-ink-500 tabular-nums">
                at {formatPrice(e.oraclePrice, decimals)}
              </span>
              <span className="text-ink-400 text-xs">{at}</span>
            </Row>
          )
        }
        if (e.eventType === 'adl') {
          const pnl = e.pnl ?? 0
          return (
            <Row
              key={e.id}
              className="flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm"
            >
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                Auto-deleveraged {e.direction}
              </span>
              <span className="text-ink-700 tabular-nums">
                {formatMoneyPrecise(e.payout ?? 0)} margin returned
              </span>
              <span
                className={clsx(
                  'font-semibold tabular-nums',
                  pnl >= 0 ? 'text-teal-600' : 'text-scarlet-600'
                )}
              >
                Profit {pnl >= 0 ? '+' : ''}
                {formatMoneyPrecise(pnl)}
              </span>
              <span className="text-ink-500 tabular-nums">
                at {formatPrice(e.oraclePrice, decimals)}
              </span>
              <span className="text-ink-400 text-xs">{at}</span>
            </Row>
          )
        }

        // close
        const pnl = e.pnl ?? 0
        return (
          <Row
            key={e.id}
            className="flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm"
          >
            <span className="text-ink-700 font-medium">
              Closed {e.direction}
            </span>
            <span className="text-ink-700 tabular-nums">
              payout {formatMoneyPrecise(e.payout ?? 0)}
            </span>
            <span
              className={clsx(
                'font-semibold tabular-nums',
                pnl >= 0 ? 'text-teal-600' : 'text-scarlet-600'
              )}
            >
              {pnl >= 0 ? '+' : ''}
              {formatMoneyPrecise(pnl)}
            </span>
            <span className="text-ink-500 tabular-nums">
              at {formatPrice(e.oraclePrice, decimals)}
            </span>
            <span className="text-ink-400 text-xs">{at}</span>
          </Row>
        )
      })}
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-primary-600 hover:text-primary-700 self-start text-xs font-medium"
        >
          {expanded ? 'Show fewer' : `Show all ${allEvents.length}`}
        </button>
      )}
      <span className="text-ink-400 text-xs">
        Liquidation forfeits a position's margin to the pool that pays winning
        positions. Full auto-deleveraging closes excess winning exposure and
        returns its remaining margin.
      </span>
    </Col>
  )
}

const PositionCard = (props: {
  position: Position
  contract: PerpContract
  onClose: () => void
  closing: boolean
  anyClosing: boolean
  oracleTradingPaused: boolean
}) => {
  const {
    position: p,
    contract,
    onClose,
    closing,
    anyClosing,
    oracleTradingPaused,
  } = props
  const markPrice = Number(contract.oraclePrice)
  const priceDecimals = inferPriceDecimals([
    markPrice,
    p.entryPrice,
    p.liquidationPrice,
  ])

  const position = {
    ...p,
    openedTime: 0,
    updatedTime: 0,
    contractId: contract.id,
  } as PerpPosition
  const pnl = getUserFacingPnl(position, markPrice)
  const pnlPct = getUserFacingPnlPercent(position, markPrice) * 100

  const isLong = p.direction === 'long'
  const accentBar = isLong ? 'bg-teal-500' : 'bg-scarlet-500'
  const accentText = isLong ? 'text-teal-600' : 'text-scarlet-600'
  const pnlColor = pnl >= 0 ? 'text-teal-600' : 'text-scarlet-600'

  // What the next funding transfer does to this position, in mana
  // (+ = you receive). Uses the live open-interest-derived rate, and the
  // exact applyFunding scaling — a receiver on the thin side earns the
  // transfer re-based on its own pool, not just rate × margin.
  const liveFundingRate = getPerpFundingRate(contract)
  const fundingMana = fundingPerPeriod(
    p,
    markPrice,
    liveFundingRate,
    contract.poolLong,
    contract.poolShort
  )
  const fundingPeriodMs = getFundingPeriodMs(contract)
  const nextFunding = nextFundingTimes(
    contract.lastFundingTime,
    Date.now(),
    1,
    fundingPeriodMs,
    contract.createdTime
  )[0]
  const fundingCountdown = nextFunding
    ? formatCountdown(nextFunding - Date.now())
    : null
  // Funding as a daily fraction of the user's original margin — the erosion
  // (or accrual) rate is what makes a per-period Ṁ figure interpretable.
  // On a daily-period contract the factor is 1 and the parenthetical still
  // earns its place: the headline is mana, this is % of margin.
  const fundingDailyPct =
    p.originalCostBasis > 0
      ? ((Math.abs(fundingMana) * (DAY_MS / fundingPeriodMs)) /
          p.originalCostBasis) *
        100
      : 0

  // Distance to liquidation as a percentage of mark — useful risk signal.
  const distToLiq = isLong
    ? (markPrice - p.liquidationPrice) / markPrice
    : (p.liquidationPrice - markPrice) / markPrice
  const liqDangerClass =
    distToLiq < 0.05
      ? 'text-scarlet-600'
      : distToLiq < 0.15
      ? 'text-amber-600'
      : 'text-ink-900'

  return (
    // The card renders at very different widths — full column on the
    // market page, a phone with large text, the hub's terminal — so its type
    // steps on the card's own width (@container), in rem so a user's larger
    // text setting counts as less room. Below that, the header wraps and the
    // number column can shrink: a flex item's default min-width is its
    // content, so two wide numbers used to push the P&L block clean out of
    // the card (overflow-hidden then clipped it).
    <Col
      className={clsx(
        'border-ink-200 bg-canvas-0 @container relative overflow-hidden rounded-lg border'
      )}
    >
      <div className={clsx('absolute inset-y-0 left-0 w-1', accentBar)} />
      <Col className="gap-3 p-4 pl-5">
        {/* Header: side + leverage badge, then PnL */}
        <Row className="flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <Col className="min-w-0 gap-0.5">
            <Row className="items-center gap-2">
              <span className={clsx('font-semibold capitalize', accentText)}>
                {p.direction} {formatLeverage(p.leverage)}×
              </span>
            </Row>
            <div className="text-ink-900 @xs:text-xl @sm:text-2xl text-lg font-bold tabular-nums">
              {formatMoney(p.size)}
              <span className="text-ink-400 ml-1.5 text-sm font-normal">
                notional
              </span>
            </div>
            <div className="text-ink-500 text-xs">
              {formatMoney(p.originalCostBasis)} margin
            </div>
          </Col>
          <Col className="ml-auto shrink-0 items-end">
            <div className="text-ink-400 whitespace-nowrap text-xs">
              Unrealized profit
            </div>
            <div
              className={clsx(
                '@xs:text-lg @sm:text-xl text-base font-bold tabular-nums',
                pnlColor
              )}
            >
              {pnl >= 0 ? '+' : ''}
              {formatMoneyPrecise(pnl)}
            </div>
            <div className={clsx('text-xs tabular-nums', pnlColor)}>
              {pnl >= 0 ? '+' : ''}
              {pnlPct.toFixed(2)}%
            </div>
          </Col>
        </Row>

        {/* Price stats grid */}
        <div className="border-ink-200 @xs:text-sm grid grid-cols-3 gap-2 border-t pt-3 text-xs">
          <PriceStat
            label="Entry"
            value={formatPrice(p.entryPrice, priceDecimals)}
          />
          <PriceStat
            label="Mark"
            value={formatPrice(markPrice, priceDecimals)}
          />
          <PriceStat
            label="Liquidation"
            value={formatPrice(p.liquidationPrice, priceDecimals)}
            valueClass={liqDangerClass}
            sublabel={
              distToLiq > 0
                ? `${(distToLiq * 100).toFixed(1)}% away`
                : 'at risk'
            }
          />
        </div>

        {/* One left-aligned sentence — a lone "Funding" label with a
            paragraph-length value right-aligned across the card read as two
            disconnected columns. */}
        {Math.abs(fundingMana) >= MONEY_PRECISE_DUST && (
          <div className="-mt-1 text-sm">
            <span
              className={clsx(
                'tabular-nums',
                fundingMana > 0 ? 'text-teal-600' : 'text-scarlet-600'
              )}
            >
              {fundingMana > 0 ? 'Earning ' : 'Paying '}
              {formatMoneyPrecise(Math.abs(fundingMana))}/
              {fundingPeriodUnit(fundingPeriodMs)}{' '}
              {fundingMana > 0 ? 'from funding' : 'in funding'}
            </span>
            <span className="text-ink-400">
              {fundingDailyPct >= 0.05 &&
                ` (${
                  fundingDailyPct >= 10
                    ? fundingDailyPct.toFixed(0)
                    : fundingDailyPct.toFixed(1)
                }%/day of margin)`}
              {fundingCountdown != null && ` · next in ${fundingCountdown}`}
            </span>
          </div>
        )}

        {distToLiq < 0.05 && (
          <div className="bg-scarlet-50 text-scarlet-600 rounded-md px-2.5 py-1.5 text-xs font-medium">
            {distToLiq > 0
              ? `A ${(distToLiq * 100).toFixed(
                  1
                )}% move against you liquidates this position — the remaining margin is forfeited to the pool.`
              : 'This position is at its liquidation price — the next adverse tick liquidates it and forfeits the remaining margin.'}
          </div>
        )}

        <Button
          color="gray-outline"
          onClick={onClose}
          loading={closing}
          disabled={anyClosing || oracleTradingPaused}
          size="md"
          className="w-full"
        >
          {oracleTradingPaused
            ? 'Close paused — waiting for oracle'
            : `Close position @ ${formatPrice(markPrice, priceDecimals)}`}
        </Button>
      </Col>
    </Col>
  )
}

// Drop trailing zeros so whole leverages render as "100×" not "100.00×",
// but fractional ones keep one decimal of precision (e.g. "1.5×").
const formatLeverage = (leverage: number) => {
  const rounded = Math.round(leverage * 10) / 10
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)
}

const PriceStat = (props: {
  label: string
  value: string
  valueClass?: string
  sublabel?: string
}) => (
  <Col className="gap-0.5">
    <div className="text-ink-500 text-xs">{props.label}</div>
    <div
      className={clsx(
        'text-ink-900 font-mono font-semibold tabular-nums',
        props.valueClass
      )}
    >
      {props.value}
    </div>
    {props.sublabel && (
      <div className="text-ink-400 text-xs">{props.sublabel}</div>
    )}
  </Col>
)
