import { BinaryOutcomes } from 'web/components/bet/bet-panel'
import { Slider } from 'web/components/widgets/slider'
import { formatMoney, formatMoneyShort } from 'common/util/format'
import { buildArray } from 'common/util/array'

export const LARGE_SLIDER_VALUES = [
  100, 250, 500, 750, 1000, 1250, 1500, 1750, 2000, 2500, 3000, 3500, 4000,
  4500, 5000, 6000, 7000, 8000, 9000, 10000, 15000, 20000, 25000,
]
export const LOW_MANA_SLIDER_VALUES = [
  1, 5, 10, 25, 50, 75, 100, 200, 300, 400, 500, 750, 1000,
]

export const BetSlider = (props: {
  amount: number | undefined
  onAmountChange: (newAmount: number | undefined) => void
  smallManaAmounts?: boolean
  binaryOutcome?: BinaryOutcomes
  disabled?: boolean
  className?: string
}) => {
  const {
    amount,
    onAmountChange,
    smallManaAmounts,
    binaryOutcome,
    disabled,
    className,
  } = props

  const sliderAmounts = smallManaAmounts
    ? LOW_MANA_SLIDER_VALUES
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
        {
          value: 0,
          label: formatMoney(sliderAmounts[0]),
        },
        {
          value: hundredIndex,
          label: formatMoney(sliderAmounts[hundredIndex]),
        },
        !smallManaAmounts && {
          value: thousandIndex,
          label: formatMoneyShort(sliderAmounts[thousandIndex]),
        },
        !smallManaAmounts && {
          value: tenThousandIndex,
          label: formatMoneyShort(sliderAmounts[tenThousandIndex]),
        },
        {
          value: maxSliderIndex,
          label: formatMoneyShort(sliderAmounts[maxSliderIndex]),
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
