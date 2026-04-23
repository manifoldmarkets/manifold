import { ArrowDownIcon, ArrowUpIcon, XIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { PerpContract } from 'common/contract'
import {
  computeFundingRate,
  liquidationPrice as computeLiquidationPrice,
} from 'common/perps/amm'
import { formatPrice, inferPriceDecimals } from 'common/perps/format'
import { formatMoney } from 'common/util/format'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { BuyAmountInput } from 'web/components/widgets/amount-input'
import { Slider, sliderColors } from 'web/components/widgets/slider'
import { api } from 'web/lib/api/api'
import { useUser } from 'web/hooks/use-user'

type OpenPosition = { direction: 'long' | 'short' }

// Tick labels rendered under the leverage slider. Kept sparse so the first
// few marks don't pile on top of each other at narrow widths — the slider
// itself is still continuous (step=0.1), these are just visual anchors.
const LEVERAGE_MARKS = [1, 5, 10, 25, 50, 100]

const getLeverageMarks = (maxLeverage: number) => {
  const marks = LEVERAGE_MARKS.filter((m) => m <= maxLeverage)
  if (marks[marks.length - 1] !== maxLeverage) marks.push(maxLeverage)
  return marks
}

export const PerpBetPanel = (props: { contract: PerpContract }) => {
  const { contract } = props
  const user = useUser()

  const [direction, setDirection] = useState<'long' | 'short'>('long')
  const [expanded, setExpanded] = useState(false)
  const [margin, setMargin] = useState<number | undefined>(10)
  const [leverage, setLeverage] = useState<number>(2)
  const [submitting, setSubmitting] = useState(false)
  const [amountError, setAmountError] = useState<string | undefined>(undefined)
  const [openDirection, setOpenDirection] = useState<
    'long' | 'short' | null
  >(null)

  useEffect(() => {
    let cancelled = false
    if (!user) {
      setOpenDirection(null)
      return
    }
    api('get-perp-positions', { contractId: contract.id, userId: user.id })
      .then((positions: OpenPosition[]) => {
        if (cancelled) return
        const open = positions[0]
        if (open) {
          setOpenDirection(open.direction)
          setDirection(open.direction)
        } else {
          setOpenDirection(null)
        }
      })
      .catch(() => {
        if (!cancelled) setOpenDirection(null)
      })
    return () => {
      cancelled = true
    }
  }, [user?.id, contract.id])

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
  // Sign matters to the user: +ve rate → longs pay shorts → a long pays this
  // fraction of notional per period. Short sees the opposite sign.
  const userFundingRate =
    direction === 'long' ? fundingRate : -fundingRate

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
      setOpenDirection(direction)
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
        <label className="text-ink-600 text-sm font-medium">Margin</label>
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
          <label className="text-ink-600 text-sm font-medium">
            Leverage
          </label>
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
        notional={notional}
        entryPrice={price}
        liqPrice={liqPrice}
        priceDecimals={priceDecimals}
        marketFundingRate={fundingRate}
        userFundingRate={userFundingRate}
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

// Drives the continuous leverage slider. We shift to a 0-based range
// internally (0..maxLeverage-1) so the Slider's mark positioning — which is
// rendered relative to (value / (max - min)) — lines up correctly; then add
// 1 when surfacing the value. Ticks are rendered at common leverage stops.
const LeverageSlider = (props: {
  value: number
  onChange: (v: number) => void
  maxLeverage: number
  color: keyof typeof sliderColors
}) => {
  const { value, onChange, maxLeverage, color } = props
  const marks = useMemo(() => getLeverageMarks(maxLeverage), [maxLeverage])

  const displayMarks = marks.map((m) => ({
    value: m - 1,
    label: `${m}×`,
  }))

  return (
    <Slider
      min={0}
      max={maxLeverage - 1}
      step={0.1}
      amount={Math.min(maxLeverage - 1, Math.max(0, value - 1))}
      onChange={(v) => onChange(Math.round((v + 1) * 10) / 10)}
      color={color}
      marks={displayMarks}
      ariaLabel="Leverage"
      ariaValueText={`${value}x leverage`}
    />
  )
}

const StatsGrid = (props: {
  notional: number
  entryPrice: number
  liqPrice: number
  priceDecimals: number
  // Market rate (positive = longs pay shorts), mirrors the Funding column in
  // the overview header.
  marketFundingRate: number
  // Same rate from this user's perspective (positive = this user pays).
  // Drives row color so a payer reads red, a receiver reads teal.
  userFundingRate: number
}) => {
  const {
    notional,
    entryPrice,
    liqPrice,
    priceDecimals,
    marketFundingRate,
    userFundingRate,
  } = props
  const hourlyPct = marketFundingRate * 100
  const sign = hourlyPct > 0 ? '+' : ''
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
        value={`${sign}${hourlyPct.toFixed(3)}%/hr`}
        valueClass={
          userFundingRate > 0
            ? 'text-red-600'
            : userFundingRate < 0
            ? 'text-teal-600'
            : undefined
        }
      />
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
