import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { PerpContract } from 'common/contract'
import {
  canEnterPerpCloseMana,
  getPerpCloseAmountError,
  perpCloseAmountFromFraction,
  perpCloseAmountFromInput,
  PerpCloseAmount,
} from 'common/perps/close-amount'
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
import {
  PERP_MIN_CLOSE_FRACTION,
  resolvePerpCloseFraction,
} from 'common/perps/amm'
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
import { Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { Input } from 'web/components/widgets/input'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { Slider } from 'web/components/widgets/slider'
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
      return false
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
      return true
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Close failed')
      // A 409 here means the row moved under the request and tells the user
      // to refresh — so refresh, rather than leaving them to do it by hand
      // against the same stale numbers that just failed.
      setRefresh((r) => r + 1)
      onAction?.()
      return false
    } finally {
      setClosing(null)
    }
  }

  return (
    <Col className="gap-3">
      {positions.map((p) => (
        <PositionSummary
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

const PositionSummary = (props: {
  position: Position
  contract: PerpContract
  onClose: (fraction: number) => Promise<boolean>
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

  // Payout is linear in the selected fraction at a given price. Keep that
  // fraction stable when switching units or receiving a new oracle quote;
  // typing a new mana amount sizes it against the latest payout instead.
  // The final payout can differ if the price moves before execution.
  const fullPayout = getPositionValue(position, markPrice)
  const [closeModalOpen, setCloseModalOpen] = useState(false)
  const [closeAmount, setCloseAmount] = useState<PerpCloseAmount>(() =>
    perpCloseAmountFromFraction(1, 'percent', fullPayout)
  )
  const isMana = closeAmount.unit === 'mana'
  const manaAvailable = canEnterPerpCloseMana(fullPayout)
  const amountUnavailable = isMana && !manaAvailable
  const amountDisabled = anyClosing || oracleTradingPaused || amountUnavailable
  const amountError = getPerpCloseAmountError(closeAmount, fullPayout)
  const closeAmountError =
    amountError === 'unavailable'
      ? 'No positive payout is available. Switch to % to close this position.'
      : amountError === 'missing'
      ? `Enter ${isMana ? 'a mana amount' : 'a percentage'} to close.`
      : amountError === 'below-minimum'
      ? `Minimum close is ${MIN_CLOSE_PERCENT}%${
          isMana
            ? ` (about ${formatMoneyPrecise(
                fullPayout * PERP_MIN_CLOSE_FRACTION
              )} returned)`
            : ''
        }.`
      : amountError === 'above-maximum'
      ? isMana
        ? `Amount exceeds the available payout. Use Max to close everything.`
        : 'Maximum close is 100%.'
      : null
  const closeFraction = amountError == null ? closeAmount.fraction : null
  // What the engine will actually take: a remainder that would be dust is
  // closed too, so the button must not promise a position that will not exist.
  const effectiveFraction =
    closeFraction == null ? null : resolvePerpCloseFraction(p, closeFraction)
  const isPartial = effectiveFraction != null && effectiveFraction < 1
  const isDustPromoted =
    closeFraction != null && closeFraction < 1 && effectiveFraction === 1
  const closePayout = (effectiveFraction ?? 0) * fullPayout
  const closePnl = (effectiveFraction ?? 0) * pnl
  const remainingMargin = (1 - (effectiveFraction ?? 1)) * p.originalCostBasis
  const sliderClosePercent =
    closeAmount.fraction != null && Number.isFinite(closeAmount.fraction)
      ? Math.min(100, Math.max(MIN_CLOSE_PERCENT, closeAmount.fraction * 100))
      : 100
  const closeAmountErrorId = `close-amount-error-${p.direction}`
  const closeAmountHintId = `close-amount-hint-${p.direction}`
  const setCloseFraction = (fraction: number) =>
    setCloseAmount(
      perpCloseAmountFromFraction(fraction, closeAmount.unit, fullPayout)
    )
  const adjustCloseAmount = (increment: number) => {
    const max = isMana ? fullPayout : 100
    const min = max * PERP_MIN_CLOSE_FRACTION
    const current = Number(closeAmount.input)
    const amount = Math.min(
      max,
      Math.max(min, (Number.isFinite(current) ? current : min) + increment)
    )
    const selection = perpCloseAmountFromInput(
      String(amount),
      closeAmount.unit,
      fullPayout
    )
    setCloseAmount(
      perpCloseAmountFromFraction(
        selection.fraction,
        closeAmount.unit,
        fullPayout
      )
    )
  }

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
    // Use the same unboxed, wrapping holdings row as UserBetSummary. Keep
    // perp-specific labels: notional exposure is not a binary market's payout.
    <Col className="gap-2 py-1">
      <Row className="flex-wrap items-center gap-4">
        <Col>
          <div className="text-ink-500 whitespace-nowrap text-sm">
            Position{' '}
            <InfoTooltip text="Notional exposure of your remaining open position, including leverage. This is not the amount returned when you close." />
          </div>
          <div className="whitespace-nowrap tabular-nums">
            {formatMoney(p.size)}{' '}
            <span className={clsx('capitalize', accentText)}>
              {p.direction} {formatLeverage(p.leverage)}×
            </span>
          </div>
        </Col>
        <Col>
          <div className="text-ink-500 whitespace-nowrap text-sm">
            Margin{' '}
            <InfoTooltip text="Original margin allocated to the portion of your position still open, excluding opening fees. Closing part of a position reduces this proportionally." />
          </div>
          <div className="whitespace-nowrap tabular-nums">
            {formatMoney(p.originalCostBasis)}
          </div>
        </Col>
        <Col>
          <div className="text-ink-500 whitespace-nowrap text-sm">
            Unrealized P&amp;L{' '}
            <InfoTooltip text="Profit or loss on your remaining open position, including funding and opening fees. Does not include portions you have already closed." />
          </div>
          <div className={clsx('whitespace-nowrap tabular-nums', pnlColor)}>
            {pnl >= 0 ? '+' : ''}
            {formatMoneyPrecise(pnl)}{' '}
            <span className="text-xs">
              ({pnl >= 0 ? '+' : ''}
              {pnlPct.toFixed(2)}%)
            </span>
          </div>
        </Col>
        <Col>
          <div className="text-ink-500 whitespace-nowrap text-sm">
            Value{' '}
            <InfoTooltip text="Amount returned if you close the entire remaining position at the current oracle price. Closing is free; the price can change before execution." />
          </div>
          <div className="whitespace-nowrap tabular-nums">
            {formatMoneyPrecise(fullPayout)}
          </div>
        </Col>
        <Button
          color="gray-outline"
          onClick={() => {
            setCloseAmount(
              perpCloseAmountFromFraction(1, 'percent', fullPayout)
            )
            setCloseModalOpen(true)
          }}
          loading={closing}
          disabled={anyClosing || oracleTradingPaused}
          size="xs"
          className="shrink-0 !py-1"
        >
          Close
        </Button>
      </Row>

      <Row className="text-ink-500 flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
        <span>
          Entry{' '}
          <span className="text-ink-700">
            {formatPrice(p.entryPrice, priceDecimals)}
          </span>
        </span>
        <span>
          Mark{' '}
          <span className="text-ink-700">
            {formatPrice(markPrice, priceDecimals)}
          </span>
        </span>
        <span>
          Liquidation{' '}
          <span className={liqDangerClass}>
            {formatPrice(p.liquidationPrice, priceDecimals)}
            {' ('}
            {distToLiq > 0
              ? `${(distToLiq * 100).toFixed(1)}% away`
              : 'at risk'}
            {')'}
          </span>
        </span>
      </Row>

      {/* One left-aligned sentence — a lone "Funding" label with a
            paragraph-length value right-aligned across the summary read as two
            disconnected columns. */}
      {Math.abs(fundingMana) >= MONEY_PRECISE_DUST && (
        <div className="text-xs">
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

      {oracleTradingPaused && (
        <div className="text-ink-500 text-xs">
          Closing is paused until the oracle updates.
        </div>
      )}

      {closeModalOpen && (
        <Modal
          open={closeModalOpen}
          setOpen={setCloseModalOpen}
          size="sm"
          ariaLabel={`Close ${p.direction} position`}
        >
          <Col className="bg-canvas-0 gap-5 rounded-t-xl px-5 py-6 sm:rounded-xl sm:px-8">
            <div>
              <h2 className="text-ink-900 text-xl font-semibold">
                Close {p.direction} position
              </h2>
              <p className="text-ink-500 mt-1 text-sm">
                {formatMoney(p.size)} notional at the latest oracle price of{' '}
                {formatPrice(markPrice, priceDecimals)}. Closing is free.
              </p>
            </div>

            <Col className="gap-2">
              <Col className="gap-1">
                <Row className="flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="text-ink-600 text-sm">Close amount</span>
                  <ChoicesToggleGroup
                    choicesMap={{ '%': 'percent', Mana: 'mana' }}
                    currentChoice={closeAmount.unit}
                    setChoice={(unit) => {
                      if (unit === 'percent' || unit === 'mana')
                        setCloseAmount(
                          perpCloseAmountFromFraction(
                            closeAmount.fraction,
                            unit,
                            fullPayout
                          )
                        )
                    }}
                    disabled={anyClosing || oracleTradingPaused}
                    disabledOptions={manaAvailable ? [] : ['mana']}
                    color="gray"
                    className="!p-0.5"
                    toggleClassName="!my-0 !px-3 !py-1 text-xs"
                  />
                </Row>
                <div className="relative w-full">
                  {isMana && (
                    <span
                      aria-hidden
                      className="text-ink-500 pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-xl"
                    >
                      Ṁ
                    </span>
                  )}
                  <Input
                    aria-label={
                      isMana
                        ? 'Estimated mana to receive'
                        : 'Percentage of position to close'
                    }
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={closeAmount.input}
                    error={closeAmountError != null}
                    aria-invalid={closeAmountError != null}
                    aria-describedby={`${closeAmountHintId}${
                      closeAmountError != null ? ` ${closeAmountErrorId}` : ''
                    }`}
                    disabled={amountDisabled}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) =>
                      setCloseAmount(
                        perpCloseAmountFromInput(
                          e.target.value,
                          closeAmount.unit,
                          fullPayout
                        )
                      )
                    }
                    className={clsx(
                      'h-[60px] w-full min-w-0 !pr-16 !text-xl tabular-nums',
                      isMana && '!pl-10'
                    )}
                  />
                  <button
                    type="button"
                    className="text-primary-600 hover:text-primary-700 absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium disabled:opacity-50"
                    disabled={amountDisabled}
                    onClick={() => setCloseFraction(1)}
                  >
                    Max
                  </button>
                </div>
              </Col>

              <Row className="items-center gap-4">
                <Slider
                  min={MIN_CLOSE_PERCENT}
                  max={100}
                  step={0.1}
                  amount={sliderClosePercent}
                  onChange={(percent) => setCloseFraction(percent / 100)}
                  disabled={amountDisabled}
                  color="gray"
                  className="min-w-0 flex-1"
                  ariaLabel="Close amount slider"
                  ariaValueText={
                    isMana
                      ? `About ${formatMoneyPrecise(
                          (sliderClosePercent / 100) * fullPayout
                        )} returned (${formatPerpClosePercent(
                          sliderClosePercent / 100
                        )} of position)`
                      : `${sliderClosePercent}% of position`
                  }
                />
                <Row className="shrink-0 gap-1.5">
                  {[-5, -1, 1, 5].map((increment) => (
                    <button
                      key={increment}
                      type="button"
                      aria-label={`${
                        increment < 0 ? 'Decrease' : 'Increase'
                      } close ${isMana ? 'mana' : 'percentage'} by ${Math.abs(
                        increment
                      )}`}
                      className="bg-canvas-100 hover:bg-ink-200 rounded-md px-2 py-1.5 text-sm disabled:opacity-50"
                      disabled={amountDisabled}
                      onClick={() => adjustCloseAmount(increment)}
                    >
                      {increment > 0 ? `+${increment}` : increment}
                    </button>
                  ))}
                </Row>
              </Row>

              <p id={closeAmountHintId} className="text-ink-500 text-xs">
                {isMana
                  ? 'Mana is the estimated amount returned, not position size. '
                  : ''}
                Final payout can change with the price.
              </p>

              {closeAmountError != null && (
                <div id={closeAmountErrorId} className="text-error text-xs">
                  {closeAmountError}
                </div>
              )}

              {isDustPromoted && (
                <div className="text-ink-500 text-xs">
                  That would leave less than the minimum margin, so the full
                  position will close.
                </div>
              )}
            </Col>

            {closeFraction != null && (
              <Col className="gap-2.5 text-sm">
                <Row className="items-center justify-between gap-3">
                  <span className="text-ink-500">Realized P&amp;L</span>
                  <span
                    className={clsx(
                      'font-medium tabular-nums',
                      closePnl >= 0 ? 'text-teal-600' : 'text-scarlet-600'
                    )}
                  >
                    {closePnl >= 0 ? '+' : ''}
                    {formatMoneyPrecise(closePnl)}
                  </span>
                </Row>

                {isPartial && (
                  <>
                    <Row className="items-center justify-between gap-3">
                      <span className="text-ink-500">Margin remaining</span>
                      <span className="text-ink-900 tabular-nums">
                        {formatMoneyPrecise(remainingMargin)}
                      </span>
                    </Row>
                    <p className="text-ink-400 text-xs">
                      The remainder keeps its entry price, leverage and
                      liquidation price.
                    </p>
                  </>
                )}

                <div className="border-ink-200 my-1 border-t" />

                <Row className="items-center justify-between gap-3">
                  <span className="text-ink-900 font-medium">
                    Estimated payout
                  </span>
                  <span className="text-ink-900 text-lg font-semibold tabular-nums">
                    {formatMoneyPrecise(closePayout)}
                  </span>
                </Row>
              </Col>
            )}

            <Button
              color="indigo"
              onClick={async () => {
                if (closeFraction != null && (await onClose(closeFraction)))
                  setCloseModalOpen(false)
              }}
              loading={closing}
              disabled={
                anyClosing || oracleTradingPaused || closeFraction == null
              }
              size="xl"
              className="w-full"
            >
              {oracleTradingPaused
                ? 'Close paused — waiting for oracle'
                : closeFraction == null || effectiveFraction == null
                ? 'Enter a valid close amount'
                : isPartial
                ? `Close ${formatPerpClosePercent(
                    effectiveFraction
                  )} of position`
                : 'Close entire position'}
            </Button>
          </Col>
        </Modal>
      )}
    </Col>
  )
}

const MIN_CLOSE_PERCENT = PERP_MIN_CLOSE_FRACTION * 100

// Drop trailing zeros so whole leverages render as "100×" not "100.00×",
// but fractional ones keep one decimal of precision (e.g. "1.5×").
const formatLeverage = (leverage: number) => {
  const rounded = Math.round(leverage * 10) / 10
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)
}
