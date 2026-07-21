import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  XIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { PerpContract } from 'common/contract'
import { ENV_CONFIG } from 'common/envs/constants'
import {
  computeFundingRate,
  liquidationPrice as computeLiquidationPrice,
} from 'common/perps/amm'
import { fundingPerPeriod } from 'common/perps/pnl'
import { formatPrice, inferPriceDecimals } from 'common/perps/format'
import { formatMoney, formatMoneyWithDecimals } from 'common/util/format'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { BuyAmountInput } from 'web/components/widgets/amount-input'
import { Slider, sliderColors } from 'web/components/widgets/slider'
import { api } from 'web/lib/api/api'
import { useUser } from 'web/hooks/use-user'
import { PerpPositionRow } from './use-perp-positions'

// Tick labels rendered under the leverage slider. Kept sparse so the first
// few marks don't pile on top of each other at narrow widths — the slider
// itself is still continuous (step=0.1), these are just visual anchors.
const LEVERAGE_MARKS = [1, 5, 10, 25, 50, 100]

const getLeverageMarks = (maxLeverage: number) => {
  const marks = LEVERAGE_MARKS.filter((m) => m <= maxLeverage)
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
}) => {
  const { contract, onTrade, positions } = props
  const user = useUser()

  const [direction, setDirection] = useState<'long' | 'short'>('long')
  const [expanded, setExpanded] = useState(false)
  const [margin, setMargin] = useState<number | undefined>(10)
  const [leverage, setLeverage] = useState<number>(2)
  const [submitting, setSubmitting] = useState(false)
  const [amountError, setAmountError] = useState<string | undefined>(undefined)

  const openDirection = useMemo(() => {
    if (!user || !positions) return null
    return positions.find((p) => p.userId === user.id)?.direction ?? null
  }, [positions, user?.id])

  // Preselect the held side, so "add to position" is the default action when
  // one exists (one-way mode: opening the opposite side is a flip).
  useEffect(() => {
    if (openDirection) setDirection(openDirection)
  }, [openDirection])

  const price = Number(contract.oraclePrice)
  const priceDecimals = inferPriceDecimals([
    price,
    computeLiquidationPrice(direction, price, leverage),
  ])

  const marginAmount = margin ?? 0
  const notional = marginAmount * leverage
  const liqPrice = useMemo(
    () => computeLiquidationPrice(direction, price, leverage),
    [direction, price, leverage]
  )
  const fundingRate = computeFundingRate(
    contract.poolLong,
    contract.poolShort,
    contract.fundingSensitivity,
    contract.maxFundingRate
  )
  // Signed mana per hour for the position being configured (+ = earns).
  // fundingPerPeriod mirrors applyFunding exactly — in particular the
  // RECEIVING side earns the transfer re-based on its own pool (f·L/S),
  // which at imbalanced pools is far more than rate × margin.
  const fundingManaPerHour = fundingPerPeriod(
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
  const maxLeverage = contract.maxLeverage

  const onSubmit = async () => {
    if (!user) {
      toast.error('Sign in to trade')
      return
    }
    if (!margin || margin <= 0 || leverage <= 0) {
      toast.error('Enter a positive margin and leverage')
      return
    }
    if (leverage > maxLeverage) {
      toast.error(`Max leverage is ${maxLeverage}×`)
      return
    }
    setSubmitting(true)
    try {
      const res = await api('place-perp-trade', {
        contractId: contract.id,
        direction,
        mana: margin,
        leverage,
      })
      const verb = isAdd ? 'Added to' : isFlip ? 'Flipped to' : 'Opened'
      toast.success(
        `${verb} ${direction} at ${formatPrice(
          res.position.entryPrice,
          priceDecimals
        )}`
      )
      // Reflect the trade everywhere on the page (position panel, pools,
      // funding, this panel's open direction) immediately — onTrade bumps
      // the parent's refreshKey, which refetches positions cache-bypassed.
      onTrade?.()
    } catch (err: any) {
      toast.error(err?.message ?? 'Trade failed')
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

  const onPickDirection = (d: 'long' | 'short') => {
    setDirection(d)
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
            className="flex-1 px-2 sm:px-6"
          >
            Long
            <ArrowUpIcon className="ml-1 h-4 w-4" />
          </Button>
          <Button
            color="red"
            size="xl"
            onClick={() => onPickDirection('short')}
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
        <DirectionToggle direction={direction} onChange={setDirection} />
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
          error={amountError}
          setError={setAmountError}
          disabled={submitting}
          showSlider
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
            {leverage.toFixed(leverage < 10 ? 1 : 0)}×
          </span>
        </Row>
        <LeverageSlider
          value={leverage}
          onChange={setLeverage}
          maxLeverage={maxLeverage}
          color={submitColor as 'green' | 'red'}
        />
      </Col>

      <StatsGrid
        direction={direction}
        notional={notional}
        margin={marginAmount}
        leverage={leverage}
        entryPrice={price}
        liqPrice={liqPrice}
        priceDecimals={priceDecimals}
        marketFundingRate={fundingRate}
        fundingManaPerHour={fundingManaPerHour}
      />

      <Button
        color={submitColor}
        onClick={onSubmit}
        loading={submitting}
        disabled={
          submitting || !user || !!amountError || !margin || margin <= 0
        }
        size="lg"
        className="w-full"
      >
        {submitLabel}
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
        activeClass="bg-red-600 text-white shadow-sm"
        inactiveClass="text-red-700 dark:text-red-400 hover:bg-canvas-50"
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

// Profit tiers shown in the scenario ladder: each is a +r return on margin.
const RETURN_TIERS = [0.25, 0.5, 1] as const

// Adaptive precision so sub-cent hourly funding amounts don't collapse to
// "0.00". Shared with the position card's funding row.
export const formatFundingPerHour = (absPerHour: number) => {
  const m = ENV_CONFIG.moneyMoniker
  if (!(absPerHour > 0)) return `${m}0`
  const body =
    absPerHour >= 0.01
      ? absPerHour.toFixed(2)
      : `${Number(absPerHour.toPrecision(2))}`
  return `${m}${body}`
}

const StatsGrid = (props: {
  direction: 'long' | 'short'
  notional: number
  margin: number
  leverage: number
  entryPrice: number
  liqPrice: number
  priceDecimals: number
  // Market rate (positive = longs pay shorts), mirrors the Funding column in
  // the overview header.
  marketFundingRate: number
  // Signed mana/hr for this configuration (positive = the user earns).
  // Drives row color so a payer reads red, a receiver reads teal.
  fundingManaPerHour: number
}) => {
  const {
    direction,
    notional,
    margin,
    leverage,
    entryPrice,
    liqPrice,
    priceDecimals,
    marketFundingRate,
    fundingManaPerHour,
  } = props

  const [scenariosOpen, setScenariosOpen] = useState(false)

  const canShowScenarios =
    Number.isFinite(entryPrice) && margin > 0 && leverage > 0

  // At leverage ℓ a +r return on margin needs a price move of r/ℓ, so the
  // target price is entry·(1 ± r/ℓ) and the mana P&L is just r·margin.
  const scenarios = canShowScenarios
    ? RETURN_TIERS.map((ret) => ({
        ret,
        price:
          direction === 'long'
            ? entryPrice * (1 + ret / leverage)
            : entryPrice * (1 - ret / leverage),
        pnl: ret * margin,
      })).filter((s) => Number.isFinite(s.price) && s.price > 0)
    : []

  const hourlyPct = marketFundingRate * 100
  const paysFunding = fundingManaPerHour < 0
  const earnsFunding = fundingManaPerHour > 0
  const fundingValue = `${
    paysFunding ? '-' : earnsFunding ? '+' : ''
  }${formatFundingPerHour(Math.abs(fundingManaPerHour))}/hr · ${
    hourlyPct >= 0 ? '+' : ''
  }${hourlyPct.toFixed(3)}%`

  return (
    <Col className="bg-canvas-50 border-ink-200 gap-2 rounded-md border p-3 text-sm">
      <StatRow label="Notional" value={formatMoney(notional)} bold />
      <StatRow
        label="Entry price"
        value={formatPrice(entryPrice, priceDecimals)}
      />
      <StatRow
        label="Liquidation"
        value={formatPrice(liqPrice, priceDecimals)}
        valueClass="text-red-600"
      />
      <StatRow
        label="Funding"
        value={fundingValue}
        valueClass={
          paysFunding
            ? 'text-red-600'
            : earnsFunding
            ? 'text-teal-600'
            : undefined
        }
      />

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
                <span className="flex-1">gain</span>
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
                    +{formatMoneyWithDecimals(s.pnl)}
                  </span>
                </Row>
              ))}
              {(paysFunding || earnsFunding) && (
                <span className="text-ink-400 text-xs leading-tight">
                  {paysFunding
                    ? 'You pay funding — subtract it from the profit above for each hour you hold.'
                    : 'You earn funding — add it to the profit above for each hour you hold.'}
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
