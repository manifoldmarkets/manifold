import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  XIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { PerpContract } from 'common/contract'
import {
  assertPerpPositionNumbers,
  getPerpBackingPool,
  getPerpOpenInterestCapacity,
  getPositionValue,
  isPerpOpenInterestWithinLimit,
  liquidationPrice as computeLiquidationPrice,
  mergedEntryPrice,
  PERP_OPEN_INTEREST_COVER_MULTIPLE,
} from 'common/perps/amm'
import {
  assertPerpTakerFeeConfig,
  calculatePerpOpenCashFlow,
  getPerpTakerFeeBps,
  getPerpTakerFeeImpact,
  perpMaxFeeFor,
  perpOpenFeeQuote,
  perpOwnContributionInputs,
  PERP_MAX_FEE_SHARE_OF_MARGIN,
} from 'common/perps/fees'
import {
  fundingPeriodNoun,
  fundingPeriodUnit,
  getFundingPeriodMs,
  getPerpFundingRate,
} from 'common/perps/funding'
import {
  fundingPerPeriod,
  getPerpPriceForUserFacingPnl,
} from 'common/perps/pnl'
import {
  formatFeePct,
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
import { BuyAmountInput } from 'web/components/widgets/amount-input'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { Slider, sliderColors } from 'web/components/widgets/slider'
import { api } from 'web/lib/api/api'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { PerpPositionRow } from './use-perp-positions'

// Tick labels rendered under the leverage slider. Density scales with the
// cap — every integer up to 5×, a few anchors up to 10×, then a sparse set so
// marks don't pile on top of each other at narrow widths — the slider itself
// is still continuous (step=0.1), these are just visual anchors.
const MEDIUM_LEVERAGE_MARKS = [1, 2, 3, 5, 10]
const SPARSE_LEVERAGE_MARKS = [1, 5, 10, 25, 50, 100]

const getLeverageMarks = (maxLeverage: number) => {
  const base =
    maxLeverage <= 5
      ? Array.from({ length: Math.floor(maxLeverage) }, (_, i) => i + 1)
      : maxLeverage <= 10
      ? MEDIUM_LEVERAGE_MARKS
      : SPARSE_LEVERAGE_MARKS
  const marks = base.filter((m) => m <= maxLeverage)
  if (marks[marks.length - 1] !== maxLeverage) marks.push(maxLeverage)
  return marks
}

export const PerpBetPanel = (props: {
  contract: PerpContract
  // Called after a successful trade so the page re-polls positions/pools
  // immediately instead of waiting for the next 15s tick.
  onTrade?: () => void
  // Shared polled positions from the parent (usePerpPositions) — the user's
  // open direction derives from these, so this panel stays consistent with
  // actions taken anywhere without its own fetch. Null while loading.
  positions?: PerpPositionRow[] | null
  // Rows for this contract that failed row-level sanity. They are excluded
  // from `positions` (nothing can render or price against them), but the
  // engine refuses to trade at all for a user who holds one, so the preview
  // must fail closed rather than quote a fresh open.
  unsoundPositions?: PerpPositionRow[]
  oracleTradingPaused?: boolean
}) => {
  const {
    contract,
    onTrade,
    positions,
    unsoundPositions,
    oracleTradingPaused = false,
  } = props
  const user = useUser()

  const [direction, setDirection] = useState<'long' | 'short'>('long')
  const [expanded, setExpanded] = useState(false)
  const [margin, setMargin] = useState<number | undefined>(10)
  const [leverage, setLeverage] = usePersistentLocalState<number>(
    2,
    'perp-leverage'
  )
  const maxLeverage = contract.maxLeverage
  // The persisted leverage is shared across markets and may exceed this
  // market's cap (or be hand-edited garbage). Clamp at USE rather than
  // writing back: merely viewing a low-cap market must not overwrite the
  // saved preference. Moving the slider persists a value the slider already
  // clamps to [1, maxLeverage].
  const effectiveLeverage =
    Number.isFinite(leverage) && leverage >= 1
      ? Math.min(leverage, maxLeverage)
      : 2
  const [submitting, setSubmitting] = useState(false)
  const [amountError, setAmountError] = useState<string | undefined>(undefined)
  const pendingTrade = useRef<{
    fingerprint: string
    idempotencyKey: string
  } | null>(null)

  const myPosition = useMemo(() => {
    if (!user || !positions) return null
    return positions.find((p) => p.userId === user.id) ?? null
  }, [positions, user?.id])
  const openDirection = myPosition?.direction ?? null

  // Preselect the held side, so "add to position" is the default action when
  // one exists (one-way mode: opening the opposite side is a flip).
  useEffect(() => {
    if (openDirection) setDirection(openDirection)
  }, [openDirection])

  const price = Number(contract.oraclePrice)
  const priceDecimals = inferPriceDecimals([
    price,
    computeLiquidationPrice(direction, price, effectiveLeverage),
  ])

  const marginAmount = margin ?? 0
  const notional = marginAmount * effectiveLeverage

  // When adding to a held position the engine merges the tranches, so entry
  // price, leverage and liquidation price all change. Preview the RESULTING
  // position, not a hypothetical standalone one — the standalone figures can
  // put the liquidation price much further away than it really ends up, and
  // the user is confirming against exactly that number.
  const isAddPreview =
    !!myPosition && myPosition.direction === direction && myPosition.size > 0
  const preview = useMemo(() => {
    if (!isAddPreview || !myPosition || notional <= 0)
      return {
        entryPrice: price,
        leverage: effectiveLeverage,
        liqPrice: computeLiquidationPrice(direction, price, effectiveLeverage),
      }
    const mergedSize = myPosition.size + notional
    const mergedCostBasis = myPosition.costBasis + marginAmount
    const mergedEntry = mergedEntryPrice(
      myPosition.size,
      myPosition.entryPrice,
      notional,
      price
    )
    const mergedLeverage =
      mergedCostBasis > 0 ? mergedSize / mergedCostBasis : effectiveLeverage
    return {
      entryPrice: mergedEntry,
      leverage: mergedLeverage,
      liqPrice: computeLiquidationPrice(direction, mergedEntry, mergedLeverage),
    }
  }, [
    isAddPreview,
    myPosition,
    notional,
    marginAmount,
    price,
    direction,
    effectiveLeverage,
  ])
  const liqPrice = preview.liqPrice
  const fundingRate = getPerpFundingRate(contract)
  // Signed mana per funding period for the position being configured
  // (+ = earns). fundingPerPeriod mirrors applyFunding exactly — in
  // particular the RECEIVING side earns the transfer re-based on its own
  // pool (f·L/S), which at imbalanced pools is far more than rate × margin.
  const fundingManaPerPeriod = fundingPerPeriod(
    { direction, size: notional, costBasis: marginAmount, entryPrice: price },
    price,
    fundingRate,
    contract.poolLong,
    contract.poolShort
  )

  const isAdd = openDirection === direction
  // Flipping: user holds a position in the opposite direction, and we'll
  // auto-close it before opening the new one (engine does this atomically).
  const isFlip = !!openDirection && openDirection !== direction

  // Open-side taker fee — closing is free, so this is the whole round-trip
  // cost, shown up front. perpOpenFeeQuote is the same input assembly the
  // engine charges from: an ADD is priced at the cumulative share against a
  // depth net of the trader's own contribution, and a flip pays on the new
  // leg only, against the post-flip-close pool depth (the close payout —
  // exactly getPositionValue — leaves the pool before the new leg is
  // priced). An ADD's netted contribution is marked to market at the same
  // price the engine uses, so a losing holder is not charged for margin that
  // has already left the pool. Accuracy of this preview needs a loaded
  // position (myPosition), which is why submit is gated on `positions`
  // below.
  const takerFeeBps = getPerpTakerFeeBps(contract)
  const takerFeeImpact = getPerpTakerFeeImpact(contract)
  const grossPoolDepth = getPerpBackingPool(
    contract.poolLong,
    contract.poolShort
  )
  // Current value of the held position at the trade mark — the SAME quantity
  // the engine reads under its lock. It plays two different roles depending
  // on the action, and never both at once:
  //   - FLIP: it is the payout that leaves the pool before the new leg is
  //     priced, so it comes off the gross depth.
  //   - ADD: it caps the trader's own standing contribution that gets netted
  //     out of that depth (min with costBasis), so margin already paid out to
  //     winners is not deducted twice over.
  const myPositionValue = myPosition
    ? getPositionValue({ ...myPosition, contractId: contract.id }, price)
    : 0
  const feeGrossDepth =
    isFlip && myPosition
      ? Math.max(grossPoolDepth - myPositionValue, 0)
      : grossPoolDepth
  const feeDetails = perpOpenFeeQuote({
    grossPoolDepth: feeGrossDepth,
    // Shared with the engine so the preview cannot derive the trader's own
    // contribution differently from the charge.
    ...perpOwnContributionInputs(
      isAdd && myPosition
        ? { ...myPosition, contractId: contract.id }
        : undefined,
      price
    ),
    addedNotional: notional,
    baseBps: takerFeeBps,
    impact: takerFeeImpact,
  })
  const openFee = feeDetails.fee
  // Refuse to preview a fee we don't trust, rather than showing a
  // plausible-looking number the engine will not charge (and a maxFee derived
  // from it, which then rejects the trade with an opaque server string).
  //
  // The check runs on the RAW contract/position fields, not on the derived
  // values, because every helper in this path is deliberately TOTAL and
  // launders bad input into a finite-looking result: getPerpBackingPool
  // returns 0 for non-finite or negative pools, getPerpTakerFeeBps /
  // getPerpTakerFeeImpact substitute the platform defaults for out-of-range
  // config, and getPositionValue returns the raw cost basis when entryPrice
  // is non-positive (getUnrealizedEquity short-circuits to 0). Checking
  // Number.isFinite on their OUTPUTS therefore passes in exactly the cases
  // that matter. The engine, by contrast, throws on all three
  // (assertPerpTakerFeeConfig, assertUserPerpRowsSound), so previewing them
  // would promise a trade that cannot succeed.
  //
  // The two asserts are the same ones the engine runs, called here rather
  // than reimplemented so the panel's notion of "valid" cannot drift from the
  // charging path's.
  const rawFeeInputsInvalid = useMemo(() => {
    try {
      assertPerpTakerFeeConfig(contract)
      if (myPosition)
        assertPerpPositionNumbers({ ...myPosition, contractId: contract.id })
    } catch {
      return true
    }
    // A row the hook filtered out of `positions` is invisible to myPosition,
    // but the engine still refuses to trade for its owner.
    if (user && unsoundPositions?.some((r) => r.userId === user.id)) return true
    return (
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(contract.poolLong) ||
      contract.poolLong < 0 ||
      !Number.isFinite(contract.poolShort) ||
      contract.poolShort < 0
    )
  }, [
    contract.id,
    contract.poolLong,
    contract.poolShort,
    contract.takerFeeBps,
    contract.takerFeeImpact,
    myPosition,
    price,
    unsoundPositions,
    user?.id,
  ])
  // Raw-field checks are necessary but NOT sufficient: individually finite
  // inputs can still overflow when combined (two ~1e308 pools sum to
  // Infinity, which getPerpBackingPool then launders to 0; costBasis plus
  // equity can do the same). Keep the derived checks alongside them.
  const feePreviewInvalid =
    rawFeeInputsInvalid ||
    !Number.isFinite(contract.poolLong + contract.poolShort) ||
    !Number.isFinite(grossPoolDepth) ||
    !Number.isFinite(feeGrossDepth) ||
    (!!myPosition && !Number.isFinite(myPositionValue)) ||
    !Number.isFinite(openFee)
  // Price protection sent with the trade: the engine rejects rather than
  // charges if the authoritative fee exceeds this. The band is the DISPLAYED
  // fee plus PERP_FEE_SLIPPAGE_BPS of notional — see perpMaxFeeFor for why it
  // is sized in bps of size rather than as a percentage of the fee.
  const maxFee = perpMaxFeeFor(openFee, notional)

  // Affordability, through the same helper the engine's 403 runs: the debit
  // is margin PLUS the fee quoted above, and a flip's free close payout —
  // myPositionValue, the same amount that leaves the pool — may fund it.
  // BuyAmountInput's own check (margin ≤ raw balance) is switched off via
  // disregardUserBalance because it is wrong in both directions here: it
  // passes a max-balance open the fee makes unaffordable (server 403), and
  // blocks a payout-funded flip the engine accepts.
  const flipPayout = isFlip && myPosition ? myPositionValue : 0
  const cashFlow =
    marginAmount > 0
      ? calculatePerpOpenCashFlow({
          balance: user?.balance ?? 0,
          margin: marginAmount,
          openFee,
          closePayout: flipPayout,
        })
      : undefined
  // Judged only once positions are loaded — before that a flip previews as a
  // fresh open with no payout to fund it, which would flash "Insufficient
  // balance" at exactly the trader it should not (submit is separately gated
  // on positions == null). An unpriceable fee already blocks submit with its
  // own message, so it is not double-reported here.
  const affordabilityError =
    user && positions != null && marginAmount > 0 && !feePreviewInvalid
      ? !cashFlow
        ? 'Unable to calculate trade cost'
        : !cashFlow.isAffordable
        ? 'Insufficient balance'
        : undefined
      : undefined
  const displayedAmountError = amountError ?? affordabilityError
  const capacity = useMemo(() => {
    if (positions == null) return null
    try {
      return getPerpOpenInterestCapacity(
        direction,
        {
          pool: { L: contract.poolLong, S: contract.poolShort },
          positions: positions.map((position) => ({
            ...position,
            contractId: contract.id,
          })),
        },
        price
      )
    } catch {
      // The engine remains authoritative. Avoid turning corrupt or transiently
      // inconsistent cached data into a render failure.
      return null
    }
  }, [
    contract.id,
    contract.poolLong,
    contract.poolShort,
    direction,
    positions,
    price,
  ])
  const exceedsCapacity =
    capacity != null &&
    Number.isFinite(notional) &&
    notional > 0 &&
    !isPerpOpenInterestWithinLimit(
      capacity.openInterest + notional,
      capacity.limit
    )

  const onSubmit = async () => {
    if (oracleTradingPaused) {
      toast.error('Trading is paused until the oracle publishes a fresh price')
      return
    }
    if (!user) {
      toast.error('Sign in to trade')
      return
    }
    if (positions == null) {
      // The fee (and add/flip detection) is previewed from the shared
      // positions; before they load, an add would be previewed as a fresh
      // open and the confirmed fee could be a fraction of the charged one.
      toast.error('Still loading positions — try again in a moment')
      return
    }
    if (!margin || margin <= 0 || effectiveLeverage <= 0) {
      toast.error('Enter a positive margin and leverage')
      return
    }
    if (effectiveLeverage > maxLeverage) {
      toast.error(`Max leverage is ${maxLeverage}×`)
      return
    }
    if (exceedsCapacity && capacity) {
      toast.error(
        `Only ${formatMoney(
          capacity.headroom
        )} of additional ${direction} notional is available`
      )
      return
    }
    if (openFee >= marginAmount * PERP_MAX_FEE_SHARE_OF_MARGIN) {
      // Mirrors the engine's hard reject.
      toast.error(
        `Fee would consume ${Math.round(
          (openFee / marginAmount) * 100
        )}% of your margin — reduce position size or leverage`
      )
      return
    }
    if (feePreviewInvalid) {
      // Mirrors the engine's fail-closed reject on an unpriceable position.
      toast.error(
        "Cannot price this trade right now — this market's data can't be read"
      )
      return
    }
    if (feeDetails.depthExhausted) {
      // Mirrors the engine's fail-closed reject: the size fee has no valid
      // depth to price against, so adding is blocked.
      toast.error(
        'Market backing is exhausted relative to your position — close or reduce instead'
      )
      return
    }
    if (!cashFlow || !cashFlow.isAffordable) {
      // Mirrors the engine's 403 (same helper, same inputs), itemised the
      // same way so the two messages can never tell different stories.
      toast.error(
        cashFlow
          ? `Insufficient balance: need ${formatMoneyPrecise(
              cashFlow.totalDebit
            )} (${formatMoney(marginAmount)} margin${
              openFee > 0 ? ` + ${formatMoneyPrecise(openFee)} fee` : ''
            }), have ${formatMoneyPrecise(cashFlow.spendableBalance)}${
              flipPayout > 0 ? ' including the flipped position' : ''
            }`
          : 'Unable to calculate trade cost'
      )
      return
    }
    setSubmitting(true)
    try {
      const fingerprint = [
        contract.id,
        direction,
        margin,
        effectiveLeverage,
      ].join(':')
      const request =
        pendingTrade.current?.fingerprint === fingerprint
          ? pendingTrade.current
          : { fingerprint, idempotencyKey: randomString() }
      pendingTrade.current = request
      const res = await api('place-perp-trade', {
        contractId: contract.id,
        direction,
        mana: margin,
        leverage: effectiveLeverage,
        idempotencyKey: request.idempotencyKey,
        maxFee,
      })
      const verb = isAdd ? 'Added to' : isFlip ? 'Flipped to' : 'Opened'
      toast.success(
        `${verb} ${direction} at ${formatPrice(
          res.position.entryPrice,
          priceDecimals
        )}`
      )
      track('bet', {
        location: 'bet panel',
        outcomeType: contract.outcomeType,
        token: contract.token,
        slug: contract.slug,
        contractId: contract.id,
        amount: margin,
        outcome: direction,
        isLimitOrder: false,
        boosted: contract.boosted,
        leverage: effectiveLeverage,
        notional,
        perpAction: isAdd ? 'add' : isFlip ? 'flip' : 'open',
        // Fee distribution telemetry: what rate people actually pay and how
        // big they trade relative to the pool, for tuning takerFeeImpact.
        // ALWAYS the engine's charged values from the trade response, never
        // the client preview — the preview can lag pools/positions, and this
        // dataset calibrates the impact coefficient.
        fee: res.fee,
        feeBps:
          res.feeBps ??
          (notional > 0 && res.fee > 0 ? (res.fee / notional) * 10_000 : 0),
        poolShareAfter: res.poolShareAfter ?? feeDetails.poolShareAfter,
      })
      // Reflect the trade everywhere on the page (position panel, pools,
      // funding, this panel's open direction) immediately — onTrade bumps
      // the parent's refreshKey, which refetches positions cache-bypassed.
      pendingTrade.current = null
      onTrade?.()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Trade failed')
    } finally {
      setSubmitting(false)
    }
  }

  const submitColor = direction === 'long' ? 'green' : 'red'
  const submitLabel = isAdd
    ? `Add to ${direction} · ${formatMoney(marginAmount)}`
    : isFlip
    ? `Flip to ${direction} · ${formatMoney(marginAmount)}`
    : `${direction === 'long' ? 'Open long' : 'Open short'} · ${formatMoney(
        marginAmount
      )}`

  const setDirectionWithTracking = (d: 'long' | 'short') => {
    track('bet intent', {
      location: 'bet panel',
      option: d,
      token: contract.token,
      boosted: contract.boosted,
      outcomeType: contract.outcomeType,
    })
    setDirection(d)
  }

  const onPickDirection = (d: 'long' | 'short') => {
    setDirectionWithTracking(d)
    setExpanded(true)
  }

  // Collapsed state: two big side-by-side Long/Short buttons, matching the
  // binary YES/NO entry point on normal markets.
  if (!expanded) {
    return (
      <Col className="mt-2 w-full gap-1">
        <Row className="w-full items-center gap-3">
          <Button
            color="green"
            size="xl"
            onClick={() => onPickDirection('long')}
            disabled={oracleTradingPaused}
            className="flex-1 px-2 sm:px-6"
          >
            Long
            <ArrowUpIcon className="ml-1 h-4 w-4" />
          </Button>
          <Button
            color="red"
            size="xl"
            onClick={() => onPickDirection('short')}
            disabled={oracleTradingPaused}
            className="flex-1 px-2 sm:px-6"
          >
            Short
            <ArrowDownIcon className="ml-1 h-4 w-4" />
          </Button>
        </Row>
      </Col>
    )
  }

  return (
    <Col className="bg-canvas-50 border-ink-200 gap-4 rounded-lg border p-4">
      <Row className="items-center justify-between">
        <DirectionToggle
          direction={direction}
          onChange={setDirectionWithTracking}
        />
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-ink-500 hover:text-ink-700 ml-3 shrink-0"
          aria-label="Close"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </Row>

      <Col className="gap-1.5">
        {/* Visual heading; the input's accessible name comes from fieldLabel. */}
        <span className="text-ink-600 text-sm font-medium">Margin</span>
        <BuyAmountInput
          parentClassName="max-w-full"
          amount={margin}
          onChange={setMargin}
          error={displayedAmountError}
          setError={setAmountError}
          // Balance is validated against margin + fee (and a flip's payout)
          // above, not against margin alone.
          disregardUserBalance
          disabled={submitting}
          showSlider
          showSliderMarks
          token="M$"
          sliderColor={submitColor as 'green' | 'red'}
          fieldLabel="Margin"
        />
      </Col>

      <Col className="gap-1.5">
        <Row className="items-baseline justify-between">
          {/* Visual heading; the slider carries ariaLabel="Leverage". */}
          <span className="text-ink-600 text-sm font-medium">Leverage</span>
          <span className="text-ink-900 font-mono text-lg font-semibold tabular-nums">
            {effectiveLeverage.toFixed(effectiveLeverage < 10 ? 1 : 0)}×
          </span>
        </Row>
        <LeverageSlider
          value={effectiveLeverage}
          onChange={setLeverage}
          maxLeverage={maxLeverage}
          color={submitColor as 'green' | 'red'}
        />
      </Col>

      <StatsGrid
        direction={direction}
        notional={notional}
        margin={marginAmount}
        entryPrice={preview.entryPrice}
        liqPrice={liqPrice}
        priceDecimals={priceDecimals}
        marketFundingRate={fundingRate}
        fundingManaPerPeriod={fundingManaPerPeriod}
        fundingPeriodMs={getFundingPeriodMs(contract)}
        isAddPreview={isAddPreview}
        feeBaseBps={takerFeeBps}
        fee={openFee}
        feeEffectiveBps={feeDetails.effectiveBps}
        feeSizeBps={feeDetails.sizeBps}
        feeDepthExhausted={feeDetails.depthExhausted}
        feePreviewInvalid={feePreviewInvalid}
        poolShareAfter={feeDetails.poolShareAfter}
      />

      {capacity && (
        <div
          className={clsx(
            'rounded-md px-3 py-2 text-xs',
            exceedsCapacity
              ? 'bg-scarlet-100 text-scarlet-700 dark:bg-scarlet-900/30 dark:text-scarlet-300'
              : 'bg-canvas-100 text-ink-600'
          )}
        >
          {exceedsCapacity ? (
            <>
              This side has only {formatMoney(capacity.headroom)} of additional
              notional capacity. Lower margin or leverage.
            </>
          ) : (
            <>
              {formatMoney(capacity.headroom)} additional {direction} notional
              capacity at the {PERP_OPEN_INTEREST_COVER_MULTIPLE}× backing
              limit.
            </>
          )}
        </div>
      )}

      <Button
        color={submitColor}
        onClick={onSubmit}
        loading={submitting}
        disabled={
          submitting ||
          !user ||
          // Positions must be loaded before the previewed fee (and add/flip
          // detection) can be trusted — see the onSubmit gate.
          positions == null ||
          !!displayedAmountError ||
          !margin ||
          margin <= 0 ||
          exceedsCapacity ||
          // Engine hard-rejects a fee at or above this share of margin.
          (marginAmount > 0 &&
            openFee >= marginAmount * PERP_MAX_FEE_SHARE_OF_MARGIN) ||
          // Engine fail-closes when the size fee has no depth to price
          // against (backing exhausted relative to the position).
          feeDetails.depthExhausted ||
          // The previewed fee cannot be trusted (non-finite mark, pools, or
          // position value), so there is nothing for the user to consent to.
          feePreviewInvalid ||
          oracleTradingPaused
        }
        size="lg"
        className="w-full"
      >
        {oracleTradingPaused
          ? 'Trading paused — waiting for oracle'
          : submitLabel}
      </Button>
    </Col>
  )
}

const DirectionToggle = (props: {
  direction: 'long' | 'short'
  onChange: (d: 'long' | 'short') => void
}) => {
  const { direction, onChange } = props
  return (
    <Row className="bg-canvas-100 border-ink-200 flex-1 overflow-hidden rounded-lg border p-1">
      <ToggleButton
        active={direction === 'long'}
        onClick={() => onChange('long')}
        activeClass="bg-teal-600 text-white shadow-sm"
        inactiveClass="text-teal-700 dark:text-teal-400 hover:bg-canvas-50"
      >
        Long
      </ToggleButton>
      <ToggleButton
        active={direction === 'short'}
        onClick={() => onChange('short')}
        activeClass="bg-scarlet-600 text-white shadow-sm"
        inactiveClass="text-scarlet-700 hover:bg-canvas-50"
      >
        Short
      </ToggleButton>
    </Row>
  )
}

const ToggleButton = (props: {
  active: boolean
  onClick: () => void
  activeClass: string
  inactiveClass: string
  children: React.ReactNode
}) => (
  <button
    type="button"
    onClick={props.onClick}
    className={clsx(
      'flex-1 rounded-md py-2 text-center text-sm font-semibold transition-colors',
      props.active ? props.activeClass : props.inactiveClass
    )}
  >
    {props.children}
  </button>
)

// Drives the leverage slider in LOG space. Leverage is perceived
// logarithmically (1×→2× matters far more than 50×→51×), and a linear scale
// crammed the 1×/5×/10× marks into the left edge — unreadable on a 375px
// phone. Position = ln(lev)/ln(maxLev), which spreads 1/5/10/25/50/100 out
// roughly evenly. The Slider positions marks at value/(max-min), so feeding it
// ln(mark) over the [0, ln(maxLev)] domain lines the labels up correctly.
const LeverageSlider = (props: {
  value: number
  onChange: (v: number) => void
  maxLeverage: number
  color: keyof typeof sliderColors
}) => {
  const { value, onChange, maxLeverage, color } = props
  const logMax = Math.log(maxLeverage)
  const marks = useMemo(() => getLeverageMarks(maxLeverage), [maxLeverage])

  const displayMarks = marks.map((m) => ({
    value: Math.log(m),
    label: `${m}×`,
  }))

  const toLeverage = (logValue: number) => {
    const lev = Math.exp(logValue)
    // Finer steps where they matter (0.5× near the bottom), whole numbers high up.
    const rounded = lev < 10 ? Math.round(lev * 10) / 10 : Math.round(lev)
    return Math.min(maxLeverage, Math.max(1, rounded))
  }

  return (
    <Slider
      min={0}
      max={logMax}
      step={logMax / 200}
      amount={Math.min(logMax, Math.max(0, Math.log(value)))}
      onChange={(v) => onChange(toLeverage(v))}
      color={color}
      marks={displayMarks}
      ariaLabel="Leverage"
      ariaValueText={`${value}x leverage`}
    />
  )
}

// Profit tiers shown in the scenario ladder: each is a +r NET return on the
// cash committed to this new position (margin + opening fee) — the same base
// the position card's percentage uses, so the two agree at the target price.
const RETURN_TIERS = [0.25, 0.5, 1] as const

const formatPoolShare = (share: number) => {
  if (!Number.isFinite(share) || share <= 0) return '0%'
  const pct = share * 100
  return `${pct >= 10 ? Math.round(pct) : Number(pct.toFixed(1))}%`
}

// The fee line turns amber once the position would be half the backing pool —
// well before the convex part of the curve really bites (≥ 100% of pool).
const LARGE_POOL_SHARE_WARNING = 0.5

const SizeFeeWhyTooltip = () => (
  <InfoTooltip text="Fees scale with your position's share of this market's backing pool — like price impact on an order book, but shown exactly before you trade. Small positions pay just the base rate. Reduce size or leverage to pay less; closing is always free.">
    <span className="text-xs font-medium">why?</span>
  </InfoTooltip>
)

const StatsGrid = (props: {
  direction: 'long' | 'short'
  notional: number
  margin: number
  entryPrice: number
  liqPrice: number
  priceDecimals: number
  // Market rate (positive = longs pay shorts), mirrors the Funding column in
  // the overview header.
  marketFundingRate: number
  // Signed mana per funding period for this configuration (positive = the
  // user earns). Drives row color so a payer reads red, a receiver teal.
  fundingManaPerPeriod: number
  // The contract's frozen funding period — labels are per-hour on fast
  // feeds, per-day on daily ones.
  fundingPeriodMs: number
  // True when adding to a held position: entryPrice/leverage/liqPrice
  // describe the merged result, so the labels say so.
  isAddPreview?: boolean
  // Open-side taker fee for THIS trade. Closing is free, so this is the
  // whole round-trip cost. The effective rate is base + size: positions
  // large relative to the pool pay more (feeSizeBps > 0), and poolShareAfter
  // says how large — the breakdown line shows all three once the size term
  // is visible at display precision.
  feeBaseBps: number
  fee: number
  feeEffectiveBps: number
  feeSizeBps: number
  poolShareAfter: number
  // The size fee could not be priced (net depth exhausted) — the engine will
  // reject this trade, so surface why while submit is disabled.
  feeDepthExhausted: boolean
  // A fee input was non-finite, so the quote shown would be meaningless.
  feePreviewInvalid: boolean
}) => {
  const {
    direction,
    notional,
    margin,
    entryPrice,
    liqPrice,
    priceDecimals,
    marketFundingRate,
    fundingManaPerPeriod,
    fundingPeriodMs,
    isAddPreview,
    feeBaseBps,
    fee,
    feeEffectiveBps,
    feeSizeBps,
    poolShareAfter,
    feeDepthExhausted,
    feePreviewInvalid,
  } = props

  const [scenariosOpen, setScenariosOpen] = useState(false)

  // Show the base/size breakdown only once the size term is visible at
  // display precision (0.01% at two decimals) — small trades read as just
  // the base.
  const showFeeBreakdown = feeSizeBps >= 1
  const isLargeShareFee =
    feeSizeBps > 0 && poolShareAfter >= LARGE_POOL_SHARE_WARNING
  // Mirrors the engine's hard reject.
  const feeExceedsMargin =
    margin > 0 && fee >= margin * PERP_MAX_FEE_SHARE_OF_MARGIN

  // Add previews are hidden on purpose: `margin` is the new tranche but
  // entryPrice describes the merged position, so a "+25% on margin" target
  // would mix two bases. Defining return for an add is a product decision.
  const canShowScenarios =
    !isAddPreview &&
    !feePreviewInvalid &&
    Number.isFinite(entryPrice) &&
    entryPrice > 0 &&
    margin > 0 &&
    notional > 0

  // Solve for the price at which the position's user-facing PnL — the number
  // the position card will show, net of the opening fee — reaches +r of the
  // cash committed. The base is margin + fee, the same denominator the card's
  // percentage uses (getUserFacingPnlPercent), so at the solved price the
  // card reads exactly "+r%" and exactly this mana profit. Without the fee
  // this is the familiar entry·(1 ± r/ℓ); with it the target sits further
  // out, so the ladder no longer promises a profit the card would then
  // report as smaller. Closing is free; future funding remains unknowable
  // here (and is called out below).
  const scenarios = canShowScenarios
    ? RETURN_TIERS.flatMap((ret) => {
        const pnl = ret * (margin + fee)
        const price = getPerpPriceForUserFacingPnl(
          {
            direction,
            size: notional,
            costBasis: margin,
            originalCostBasis: margin,
            takerFeeCostBasis: fee,
            entryPrice,
          },
          pnl
        )
        return price === undefined ? [] : [{ ret, price, pnl }]
      })
    : []

  const periodPct = marketFundingRate * 100
  // Dust from a near-balanced pool would otherwise read "-Ṁ0/hr".
  const paysFunding = fundingManaPerPeriod <= -MONEY_PRECISE_DUST
  const earnsFunding = fundingManaPerPeriod >= MONEY_PRECISE_DUST
  const fundingValue = `${
    paysFunding ? '-' : earnsFunding ? '+' : ''
  }${formatMoneyPrecise(Math.abs(fundingManaPerPeriod))}/${fundingPeriodUnit(
    fundingPeriodMs
  )} · ${periodPct >= 0 ? '+' : ''}${periodPct.toFixed(3)}%`

  return (
    <Col className="bg-canvas-50 border-ink-200 gap-2 rounded-md border p-3 text-sm">
      <StatRow label="Notional" value={formatMoney(notional)} bold />
      <StatRow
        label={isAddPreview ? 'New avg. entry' : 'Entry price'}
        value={formatPrice(entryPrice, priceDecimals)}
      />
      <StatRow
        label={isAddPreview ? 'New liquidation' : 'Liquidation'}
        value={formatPrice(liqPrice, priceDecimals)}
        valueClass="text-scarlet-600"
      />
      <StatRow
        label="Funding"
        value={fundingValue}
        valueClass={
          paysFunding
            ? 'text-scarlet-600'
            : earnsFunding
            ? 'text-teal-600'
            : undefined
        }
      />
      {/* feeDepthExhausted must force the block open: with base = 0 both
          fee components read zero exactly when the explanation for the
          disabled submit lives here. */}
      {(feeBaseBps > 0 ||
        feeSizeBps > 0 ||
        feeDepthExhausted ||
        feePreviewInvalid) && (
        <Col className="gap-0.5">
          <StatRow
            label="Fee (free to close)"
            // Never render a number we don't trust — the scarlet line below
            // is the whole message in that case.
            value={
              feePreviewInvalid
                ? '—'
                : `${formatMoneyPrecise(fee)} (${formatFeePct(
                    notional > 0 ? feeEffectiveBps : feeBaseBps
                  )})`
            }
            valueClass={
              isLargeShareFee && !feePreviewInvalid
                ? 'font-semibold text-amber-700 dark:text-amber-400'
                : undefined
            }
          />
          {/* ONE compact breakdown line for both severities — only the color
              changes with isLargeShareFee, so copy and formats cannot fork
              across the threshold. The full explanation lives in the "why?"
              hover to keep the panel small. */}
          {!feePreviewInvalid && (showFeeBreakdown || isLargeShareFee) && (
            <Row
              className={clsx(
                'items-center gap-1 text-xs leading-tight',
                // amber-700 in light mode: amber-600 on canvas-50 is ~2.9:1,
                // below the 4.5:1 required for text this size.
                isLargeShareFee
                  ? 'font-medium text-amber-700 dark:text-amber-400'
                  : 'text-ink-400'
              )}
            >
              <span>
                {formatFeePct(feeBaseBps)} base + {formatFeePct(feeSizeBps)}{' '}
                size — position is {formatPoolShare(poolShareAfter)} of pool
              </span>
              <SizeFeeWhyTooltip />
            </Row>
          )}
          {feeExceedsMargin && !feePreviewInvalid && (
            <span className="text-scarlet-600 text-xs font-medium leading-tight">
              Fee would consume over{' '}
              {Math.round(PERP_MAX_FEE_SHARE_OF_MARGIN * 100)}% of your margin —
              reduce position size or leverage.
            </span>
          )}
          {feeDepthExhausted && !feePreviewInvalid && (
            <span className="text-scarlet-600 text-xs font-medium leading-tight">
              This market's backing is exhausted relative to your position —
              close or reduce instead of adding.
            </span>
          )}
          {feePreviewInvalid && (
            <span className="text-scarlet-600 text-xs font-medium leading-tight">
              This market's data can't be read right now, so the fee can't be
              quoted and trading is blocked.
            </span>
          )}
        </Col>
      )}

      {scenarios.length > 0 && (
        <>
          <div className="border-ink-200 -mx-3 mt-0.5 border-t" />
          <button
            type="button"
            onClick={() => setScenariosOpen((o) => !o)}
            className="text-ink-500 hover:text-ink-700 flex items-center gap-1 self-start py-0.5 text-xs font-medium"
            aria-expanded={scenariosOpen}
          >
            <ChevronDownIcon
              className={clsx(
                'h-3.5 w-3.5 transition-transform',
                scenariosOpen && 'rotate-180'
              )}
            />
            {scenariosOpen ? 'Hide profit scenarios' : 'Show profit scenarios'}
          </button>

          {scenariosOpen && (
            <>
              <Row className="text-ink-400 items-baseline text-xs">
                <span className="flex-1">return</span>
                <span className="w-20 text-right">at price</span>
                <span className="w-20 text-right">profit</span>
              </Row>
              {scenarios.map((s) => (
                <Row key={s.ret} className="items-baseline tabular-nums">
                  <span className="text-ink-700 flex-1 font-medium">
                    +{Math.round(s.ret * 100)}%
                  </span>
                  <span className="text-ink-700 w-20 text-right">
                    {formatPrice(s.price, priceDecimals)}
                  </span>
                  <span className="w-20 text-right font-medium text-teal-600">
                    +{formatMoneyPrecise(s.pnl)}
                  </span>
                </Row>
              ))}
              {(paysFunding || earnsFunding) && (
                <span className="text-ink-400 text-xs leading-tight">
                  {paysFunding
                    ? `You pay funding — subtract it from the profit above for each ${fundingPeriodNoun(
                        fundingPeriodMs
                      )} you hold.`
                    : `You earn funding — add it to the profit above for each ${fundingPeriodNoun(
                        fundingPeriodMs
                      )} you hold.`}
                </span>
              )}
            </>
          )}
        </>
      )}
    </Col>
  )
}

const StatRow = (props: {
  label: string
  value: string
  valueClass?: string
  bold?: boolean
}) => (
  <Row className="items-baseline justify-between">
    <span className="text-ink-500">{props.label}</span>
    <span
      className={clsx(
        'tabular-nums',
        props.bold && 'text-ink-900 font-semibold',
        props.valueClass
      )}
    >
      {props.value}
    </span>
  </Row>
)
