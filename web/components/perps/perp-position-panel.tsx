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
  getPositionValue,
  getUserFacingPnl,
  getUserFacingPnlPercent,
} from 'common/perps/pnl'
import { resolvePerpCloseFraction } from 'common/perps/amm'
import { PerpPosition } from 'common/perps/position'
import { DAY_MS } from 'common/util/time'
import {
  formatCountdown,
  formatPerpClosePercent,
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
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
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

  const close = async (direction: 'long' | 'short', fraction = 1) => {
    if (oracleTradingPaused) {
      toast.error('Closing is paused until the oracle publishes a fresh price')
      return
    }
    setClosing(direction)
    try {
      const position = positions.find((p) => p.direction === direction)
      if (!position) throw new Error('Position is no longer open')
      // A partial close leaves openedTime alone, so the fingerprint has to
      // carry what the close itself is: two 25% closes in a row are separate
      // trades, and sharing an idempotency key would silently replay the
      // first instead of running the second. `size` moves after every close,
      // so a retry of the SAME click still dedupes.
      const fingerprint = [
        contract.id,
        direction,
        position.openedTime,
        position.size,
        fraction,
      ].join(':')
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
        // Bind a partial close to the row it was sized against. openedTime
        // survives a partial close, so it alone cannot tell the engine that
        // this 75% was 75% OF 400 rather than of whatever is there now.
        ...(fraction < 1 ? { fraction, expectedSize: position.size } : {}),
      })
      // The engine promotes a close whose remainder would be dust, so what
      // came back — not what was asked for — decides the wording.
      const closedAll = res.remainingSize <= 0
      toast.success(
        `${
          closedAll
            ? `Closed ${direction}`
            : `Closed ${formatPerpClosePercent(res.fraction)} of ${direction}`
        } — payout ${formatMoneyPrecise(
          res.payout
        )} (profit ${formatMoneyPrecise(res.pnl)})`
      )
      track('sell shares', {
        outcomeType: contract.outcomeType,
        slug: contract.slug,
        contractId: contract.id,
        shares: position.size * res.fraction,
        outcome: direction,
        token: contract.token,
        perpAction: closedAll ? 'close' : 'partial-close',
        fraction: res.fraction,
        payout: res.payout,
        pnl: res.pnl,
      })
      // Only a full close may hide the row optimistically. A partial one
      // keeps the same openedTime, so marking it closed here would hide the
      // position that is still open — permanently.
      if (closedAll)
        setClosedAt((prev) => ({ ...prev, [direction]: Date.now() }))
      setRefresh((r) => r + 1)
      delete pendingCloses.current[direction]
      // Pools changed; let the page re-poll the contract immediately.
      onAction?.()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Close failed')
      // A 409 here means the row moved under the request and tells the user
      // to refresh — so refresh, rather than leaving them to do it by hand
      // against the same stale numbers that just failed.
      setRefresh((r) => r + 1)
      onAction?.()
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
          onClose={(fraction) => close(p.direction, fraction)}
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
  fraction: number | null
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

        // close, whole or partial
        const pnl = e.pnl ?? 0
        // Closes written before partial closes existed carry no fraction and
        // were whole ones.
        const partial = e.fraction != null && e.fraction < 1 ? e.fraction : null
        return (
          <Row
            key={e.id}
            className="flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm"
          >
            <span className="text-ink-700 font-medium">
              {partial != null
                ? `Closed ${formatPerpClosePercent(partial)} of ${e.direction}`
                : `Closed ${e.direction}`}
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
  onClose: (fraction: number) => void
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

  // How much of the position this close takes. Everything a partial close
  // pays and leaves behind is LINEAR in the fraction — π, the payout and both
  // pool debits all scale with q and c — so the preview below is exact, not
  // an estimate, and the survivor's entry price, leverage and liquidation
  // price are untouched by construction.
  const [closeFraction, setCloseFraction] = useState(1)
  // What the engine will actually take: a remainder that would be dust is
  // closed too, so the button must not promise a position that will not exist.
  const effectiveFraction = resolvePerpCloseFraction(p, closeFraction)
  const isPartial = effectiveFraction < 1
  const fullPayout = getPositionValue(position, markPrice)
  const closePayout = effectiveFraction * fullPayout
  const closePnl = effectiveFraction * pnl
  const remainingMargin = (1 - effectiveFraction) * p.originalCostBasis

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
        <Row className="items-start justify-between gap-3">
          <Col className="min-w-0 gap-0.5">
            <Row className="items-center gap-2">
              <span
                className={clsx(
                  'whitespace-nowrap text-[clamp(13px,4.8cqw,1rem)] font-semibold capitalize',
                  accentText
                )}
              >
                {p.direction} {formatLeverage(p.leverage)}×
              </span>
            </Row>
            {/* The two headline numbers must share one line at any card
                width, so their size follows the card (cqw) between fixed
                px floors and the desktop sizes. Floors are px, not rem, so
                a large OS text setting can't re-widen them past the card. */}
            <div className="text-ink-900 whitespace-nowrap text-[clamp(15px,6.5cqw,1.5rem)] font-bold tabular-nums leading-tight">
              {formatMoney(p.size)}
            </div>
            <div className={clsx('text-ink-500', CARD_LABEL)}>
              notional · {formatMoney(p.originalCostBasis)} margin
            </div>
          </Col>
          <Col className="shrink-0 items-end">
            <div className={clsx('text-ink-400 whitespace-nowrap', CARD_LABEL)}>
              Unrealized profit
            </div>
            <div
              className={clsx(
                'whitespace-nowrap text-[clamp(13px,5.5cqw,1.25rem)] font-bold tabular-nums leading-tight',
                pnlColor
              )}
            >
              {pnl >= 0 ? '+' : ''}
              {formatMoneyPrecise(pnl)}
            </div>
            <div className={clsx('tabular-nums', CARD_LABEL, pnlColor)}>
              {pnl >= 0 ? '+' : ''}
              {pnlPct.toFixed(2)}%
            </div>
          </Col>
        </Row>

        {/* Price stats grid */}
        <div className="border-ink-200 grid grid-cols-3 gap-2 border-t pt-3">
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

        <Col className="gap-2">
          <Row className="items-center justify-between gap-2">
            <span className={clsx('text-ink-500', CARD_LABEL)}>
              Close how much
            </span>
            <ChoicesToggleGroup
              currentChoice={closeFraction}
              color="gray"
              disabled={anyClosing || oracleTradingPaused}
              choicesMap={{ '25%': 0.25, '50%': 0.5, '75%': 0.75, All: 1 }}
              setChoice={(choice) => setCloseFraction(choice as number)}
              toggleClassName="!px-2.5 !py-1"
              className="!text-xs"
            />
          </Row>

          {isPartial && (
            <div className={clsx('text-ink-500', CARD_LABEL)}>
              Pays out{' '}
              <span className="text-ink-700 font-semibold tabular-nums">
                {formatMoneyPrecise(closePayout)}
              </span>{' '}
              and realizes{' '}
              <span
                className={clsx(
                  'font-semibold tabular-nums',
                  closePnl >= 0 ? 'text-teal-600' : 'text-scarlet-600'
                )}
              >
                {closePnl >= 0 ? '+' : ''}
                {formatMoneyPrecise(closePnl)}
              </span>
              . {formatMoneyPrecise(remainingMargin)} of margin stays open at
              the same entry price, leverage and liquidation price.
            </div>
          )}

          <Button
            color="gray-outline"
            onClick={() => onClose(closeFraction)}
            loading={closing}
            disabled={anyClosing || oracleTradingPaused}
            size="md"
            className="w-full"
          >
            {oracleTradingPaused
              ? 'Close paused — waiting for oracle'
              : `Close ${
                  isPartial
                    ? `${formatPerpClosePercent(effectiveFraction)} of `
                    : ''
                }position @ ${formatPrice(markPrice, priceDecimals)}`}
          </Button>
        </Col>
      </Col>
    </Col>
  )
}

// Small type inside the card follows the card's width (cqw) between a px
// floor and the usual text-xs / text-sm, so three mono prices and the
// labels above them keep fitting when a phone runs a large text setting.
// Card widths of ~336px and up get exactly text-xs / text-sm.
const CARD_LABEL = 'text-[clamp(10px,3.6cqw,0.75rem)]'
const CARD_VALUE = 'text-[clamp(11px,4.2cqw,0.875rem)]'

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
  <Col className="min-w-0 gap-0.5">
    <div className={clsx('text-ink-500', CARD_LABEL)}>{props.label}</div>
    <div
      className={clsx(
        'text-ink-900 whitespace-nowrap font-mono font-semibold tabular-nums',
        CARD_VALUE,
        props.valueClass
      )}
    >
      {props.value}
    </div>
    {props.sublabel && (
      <div className={clsx('text-ink-400', CARD_LABEL)}>{props.sublabel}</div>
    )}
  </Col>
)
