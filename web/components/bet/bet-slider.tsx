import { formatWithToken, InputTokenType } from 'common/util/format'
import { BinaryOutcomes } from 'web/components/bet/bet-panel'
import { Slider, sliderColors } from 'web/components/widgets/slider'

export const LARGE_SLIDER_VALUES = [
  1, 25, 50, 75, 100, 150, 250, 350, 500, 750, 1000, 1250, 1500, 2000, 2500,
  3000, 3500, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 15000, 20000, 25000,
]

export const LARGE_SLIDER_VALUE_LABELS = [100, 1000, 10000]

export const SMALL_SLIDER_VALUES = [
  1, 2, 5, 7, 10, 15, 20, 25, 30, 40, 50, 75, 100, 200, 300, 400, 500, 750,
  1000,
]

export const SMALL_SLIDER_VALUE_LABELS = [1, 100, 1000]

export const MAX_CASH_SMALL_SLIDER_VALUE = 500
export const MAX_CASH_LARGE_SLIDER_VALUE = 1000

export const CASH_SMALL_SLIDER_VALUES = SMALL_SLIDER_VALUES.filter(
  (a) => a <= MAX_CASH_SMALL_SLIDER_VALUE
)

export const CASH_SMALL_SLIDER_VALUE_LABELS = [1, 100, 500]

export const CASH_LARGE_SLIDER_VALUES = LARGE_SLIDER_VALUES.filter(
  (a) => a <= MAX_CASH_LARGE_SLIDER_VALUE
)

export const CASH_LARGE_SLIDER_VALUE_LABELS = [1, 100, 1000]

export const BetSlider = (props: {
  amount: number | undefined
  onAmountChange: (newAmount: number | undefined) => void
  smallAmounts?: boolean
  binaryOutcome?: BinaryOutcomes
  disabled?: boolean
  className?: string
  token?: InputTokenType
  sliderColor?: keyof typeof sliderColors
}) => {
  const {
    amount,
    onAmountChange,
    smallAmounts,
    binaryOutcome,
    disabled,
    className,
    sliderColor,
  } = props

  const token = props.token ?? 'M$'

  const sliderAmounts =
    token == 'CASH'
      ? smallAmounts
        ? CASH_SMALL_SLIDER_VALUES
        : CASH_LARGE_SLIDER_VALUES
      : smallAmounts
      ? SMALL_SLIDER_VALUES
      : LARGE_SLIDER_VALUES

  const sliderMarkArray =
    token == 'CASH'
      ? smallAmounts
        ? CASH_SMALL_SLIDER_VALUE_LABELS
        : CASH_LARGE_SLIDER_VALUE_LABELS
      : smallAmounts
      ? SMALL_SLIDER_VALUE_LABELS
      : LARGE_SLIDER_VALUE_LABELS

  const marks = sliderMarkArray.map((a) => {
    return {
      value: sliderAmounts.findIndex((amount) => amount === a),
      label: formatWithToken({
        amount: a,
        token: token,
        short: true,
      }),
    }
  })

  const maxSliderIndex = sliderAmounts.length - 1
  const amountToSliderIndex = (amount: number) => {
    const index = sliderAmounts.findLastIndex((a) => amount >= a)
    return index === -1 ? 0 : index
  }

  const sliderIndex = amountToSliderIndex(amount ?? 0)

  return (
    <Slider
      className={className}
      min={0}
      max={maxSliderIndex}
      marks={marks}
      color={
        sliderColor
          ? (sliderColor as any)
          : binaryOutcome === 'YES'
          ? 'green'
          : binaryOutcome === 'NO'
          ? 'red'
          : 'gray'
      }
      amount={sliderIndex}
      onChange={(value) => {
        onAmountChange(sliderAmounts[value])
      }}
      step={1}
      disabled={disabled}
    />
  )
}
