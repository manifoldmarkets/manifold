import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { PerpContract } from 'common/contract'
import { computeFundingRate } from 'common/perps/amm'
import { nextFundingTimes } from 'common/perps/chart-projections'
import { fundingPerPeriod, getUserFacingPnl } from 'common/perps/pnl'
import { PerpPosition } from 'common/perps/position'
import { MINUTE_MS } from 'common/util/time'
import { formatPrice, inferPriceDecimals } from 'common/perps/format'
import { formatMoney } from 'common/util/format'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { api } from 'web/lib/api/api'
import { useUser } from 'web/hooks/use-user'
import { formatFundingPerHour } from './perp-bet-panel'
import { PerpPositionRow, scheduleFreshBurst } from './use-perp-positions'

type Position = {
  userId: string
  direction: 'long' | 'short'
  size: number
  costBasis: number
  originalCostBasis: number
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
}) => {
  const { contract, onAction, refreshKey } = props
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
  const [refresh, setRefresh] = useState(0)
  // Terminal events (closes/liquidations) for the tombstone section: a
  // liquidated position must NOT silently vanish from the page ("I have no
  // idea what happened except that I lost").
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
            events
              .filter(
                (e) => e.eventType === 'close' || e.eventType === 'liquidation'
              )
              .slice(0, 5)
          )
        })
        .catch(() => {})
    const cancelBurst = fresh ? scheduleFreshBurst(load) : (load(), undefined)
    return () => {
      cancelled = true
      cancelBurst?.()
    }
  }, [contract.id, user?.id, refresh, refreshKey])

  if (!user) return null
  if (!positions.length && !pastEvents.length) return null

  const close = async (direction: 'long' | 'short') => {
    setClosing(direction)
    try {
      const res = await api('close-perp-position', {
        contractId: contract.id,
        direction,
      })
      toast.success(
        `Closed ${direction} — payout ${formatMoney(
          res.payout
        )} (PnL ${formatMoney(res.pnl)})`
      )
      setClosedAt((prev) => ({ ...prev, [direction]: Date.now() }))
      setRefresh((r) => r + 1)
      // Pools changed; let the page re-poll the contract immediately.
      onAction?.()
    } catch (err: any) {
      toast.error(err?.message ?? 'Close failed')
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
const PositionHistory = (props: { events: PerpHistoryEvent[] }) => {
  const { events } = props
  return (
    <Col className="border-ink-200 bg-canvas-0 gap-2 rounded-lg border p-3">
      <span className="text-ink-500 text-xs font-semibold uppercase">
        Your position history
      </span>
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
                −{formatMoney(lost)} margin
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
              payout {formatMoney(e.payout ?? 0)}
            </span>
            <span
              className={clsx(
                'font-semibold tabular-nums',
                pnl >= 0 ? 'text-teal-600' : 'text-scarlet-600'
              )}
            >
              {pnl >= 0 ? '+' : ''}
              {formatMoney(pnl)}
            </span>
            <span className="text-ink-500 tabular-nums">
              at {formatPrice(e.oraclePrice, decimals)}
            </span>
            <span className="text-ink-400 text-xs">{at}</span>
          </Row>
        )
      })}
      <span className="text-ink-400 text-xs">
        Liquidation forfeits a position's margin to the pool that pays winning
        positions.
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
}) => {
  const { position: p, contract, onClose, closing, anyClosing } = props
  const markPrice = Number(contract.oraclePrice)
  const priceDecimals = inferPriceDecimals([
    markPrice,
    p.entryPrice,
    p.liquidationPrice,
  ])

  const pnl = getUserFacingPnl(
    {
      ...p,
      openedTime: 0,
      updatedTime: 0,
      contractId: contract.id,
    } as PerpPosition,
    markPrice
  )
  const pnlPct = p.originalCostBasis > 0 ? (pnl / p.originalCostBasis) * 100 : 0

  const isLong = p.direction === 'long'
  const accentBar = isLong ? 'bg-teal-500' : 'bg-red-500'
  const accentText = isLong ? 'text-teal-600' : 'text-red-600'
  const pnlColor = pnl >= 0 ? 'text-teal-600' : 'text-red-600'

  // What the next hourly funding transfer does to this position, in mana
  // (+ = you receive). Uses the live pool-derived rate, and the exact
  // applyFunding scaling — a receiver on the thin side earns the transfer
  // re-based on its own pool, not just rate × margin.
  const liveFundingRate = computeFundingRate(
    contract.poolLong,
    contract.poolShort,
    contract.fundingSensitivity,
    contract.maxFundingRate
  )
  const fundingMana = fundingPerPeriod(
    p,
    markPrice,
    liveFundingRate,
    contract.poolLong,
    contract.poolShort
  )
  const nextFunding = nextFundingTimes(
    contract.lastFundingTime,
    Date.now(),
    1
  )[0]
  const minsToFunding = nextFunding
    ? Math.max(1, Math.ceil((nextFunding - Date.now()) / MINUTE_MS))
    : null

  // Distance to liquidation as a percentage of mark — useful risk signal.
  const distToLiq = isLong
    ? (markPrice - p.liquidationPrice) / markPrice
    : (p.liquidationPrice - markPrice) / markPrice
  const liqDangerClass =
    distToLiq < 0.05
      ? 'text-red-600'
      : distToLiq < 0.15
      ? 'text-amber-600'
      : 'text-ink-900'

  return (
    <Col
      className={clsx(
        'border-ink-200 bg-canvas-0 relative overflow-hidden rounded-lg border'
      )}
    >
      <div className={clsx('absolute inset-y-0 left-0 w-1', accentBar)} />
      <Col className="gap-3 p-4 pl-5">
        {/* Header: side + leverage badge, then PnL */}
        <Row className="items-start justify-between gap-2">
          <Col className="gap-0.5">
            <Row className="items-center gap-2">
              <span className={clsx('font-semibold capitalize', accentText)}>
                {p.direction} {formatLeverage(p.leverage)}×
              </span>
            </Row>
            <div className="text-ink-900 text-2xl font-bold tabular-nums">
              {formatMoney(p.size)}
              <span className="text-ink-400 ml-1.5 text-sm font-normal">
                notional
              </span>
            </div>
            <div className="text-ink-500 text-xs">
              {formatMoney(p.originalCostBasis)} margin
            </div>
          </Col>
          <Col className="items-end">
            <div className="text-ink-400 text-xs">Unrealized PnL</div>
            <div className={clsx('text-xl font-bold tabular-nums', pnlColor)}>
              {pnl >= 0 ? '+' : ''}
              {formatMoney(pnl)}
            </div>
            <div className={clsx('text-xs tabular-nums', pnlColor)}>
              {pnl >= 0 ? '+' : ''}
              {pnlPct.toFixed(2)}%
            </div>
          </Col>
        </Row>

        {/* Price stats grid */}
        <div className="border-ink-200 grid grid-cols-3 gap-2 border-t pt-3 text-sm">
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

        {fundingMana !== 0 && (
          <Row className="-mt-1 items-baseline justify-between text-sm">
            <span className="text-ink-500">Funding</span>
            <span
              className={clsx(
                'tabular-nums',
                fundingMana > 0 ? 'text-teal-600' : 'text-red-600'
              )}
            >
              {fundingMana > 0 ? 'earning ' : 'paying '}
              {formatFundingPerHour(Math.abs(fundingMana))}/hr
              {minsToFunding != null && (
                <span className="text-ink-400">
                  {' '}
                  · next in {minsToFunding}m
                </span>
              )}
            </span>
          </Row>
        )}

        <Button
          color="gray-outline"
          onClick={onClose}
          loading={closing}
          disabled={anyClosing}
          size="md"
          className="w-full"
        >
          Close position @ {formatPrice(markPrice, priceDecimals)}
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
