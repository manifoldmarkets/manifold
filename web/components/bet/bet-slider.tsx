import { buildArray } from 'common/util/array'
import { formatWithToken, InputTokenType } from 'common/util/format'
import { BinaryOutcomes } from 'web/components/bet/bet-panel'
import { Slider } from 'web/components/widgets/slider'

export const LARGE_SLIDER_VALUES = [
  1, 25, 50, 75, 100, 150, 250, 350, 500, 750, 1000, 1250, 1500, 2000, 2500,
  3000, 3500, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 15000, 20000, 25000,
]
export const SMALL_SLIDER_VALUES = [
  1, 2, 5, 7, 10, 15, 20, 25, 30, 40, 50, 75, 100, 200, 300, 400, 500, 750,
  1000,
]

export const BetSlider = (props: {
  amount: number | undefined
  onAmountChange: (newAmount: number | undefined) => void
  smallManaAmounts?: boolean
  binaryOutcome?: BinaryOutcomes
  disabled?: boolean
  className?: string
  token?: InputTokenType
}) => {
  const {
    amount,
    onAmountChange,
    smallManaAmounts,
    binaryOutcome,
    disabled,
    className,
  } = props

  const token = props.token ?? 'M$'

  const sliderAmounts = smallManaAmounts
    ? SMALL_SLIDER_VALUES
    : LARGE_SLIDER_VALUES

  const maxSliderIndex = sliderAmounts.length - 1
  const amountToSliderIndex = (amount: number) => {
    const index = sliderAmounts.findLastIndex((a) => amount >= a)
    return index === -1 ? 0 : index
  }

  const sliderIndex = amountToSliderIndex(amount ?? 0)
  const hundredIndex = sliderAmounts.findIndex((a) => a === 100)
  const thousandIndex = sliderAmounts.findIndex((a) => a === 1000)
  const tenThousandIndex = sliderAmounts.findIndex((a) => a === 10000)

  return (
    <Slider
      className={className}
      min={0}
      max={maxSliderIndex}
      marks={buildArray(
        smallManaAmounts && {
          value: 0,
          label: formatWithToken({
            amount: sliderAmounts[0],
            token: token,
            short: true,
          }),
        },
        {
          value: hundredIndex,
          label: formatWithToken({
            amount: sliderAmounts[hundredIndex],
            token: token,
            short: true,
          }),
        },
        !smallManaAmounts && {
          value: thousandIndex,
          label: formatWithToken({
            amount: sliderAmounts[thousandIndex],
            token: token,
            short: true,
          }),
        },
        !smallManaAmounts && {
          value: tenThousandIndex,
          label: formatWithToken({
            amount: sliderAmounts[tenThousandIndex],
            token: token,
            short: true,
          }),
        },
        smallManaAmounts && {
          value: maxSliderIndex,
          label: formatWithToken({
            amount: sliderAmounts[maxSliderIndex],
            token: token,
            short: true,
          }),
        }
      )}
      color={
        binaryOutcome === 'YES'
          ? 'green'
          : binaryOutcome === 'NO'
          ? 'red'
          : 'indigo'
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
