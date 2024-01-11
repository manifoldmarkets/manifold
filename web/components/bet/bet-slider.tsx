import { BinaryOutcomes } from 'web/components/bet/bet-panel'
import { Slider } from 'web/components/widgets/slider'
import { formatMoney } from 'common/util/format'
import { buildArray } from 'common/util/array'

export const largerSliderAmounts = [
  1, 2, 3, 5, 10, 15, 20, 25, 35, 40, 45, 50, 55, 60, 70, 80, 90, 100, 110, 120,
  130, 140, 150, 165, 180, 200, 225, 250, 275, 300, 350, 400, 450, 500, 550,
  600, 650, 700, 800, 900, 1000,
]
export const lowerManaSliderAmounts = [
  1, 2, 3, 5, 7, 10, 12, 15, 17, 20, 22, 25, 27, 30, 35, 40, 45, 50, 55, 60, 65,
  70, 75, 80, 85, 90, 95, 100,
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
    ? lowerManaSliderAmounts
    : largerSliderAmounts
  const maxSliderIndex = sliderAmounts.length - 1
  const amountToSliderIndex = (amount: number) => {
    const index = sliderAmounts.findLastIndex((a) => amount >= a)
    return index === -1 ? 0 : index
  }

  const sliderIndex = amountToSliderIndex(amount ?? 0)
  const tenIndex = sliderAmounts.findIndex((a) => a === 10)
  const tenAmountDistance = (100 * tenIndex) / maxSliderIndex
  const hundredIndex = sliderAmounts.findIndex((a) => a === 100)
  const hundredAmountDistance = (100 * hundredIndex) / maxSliderIndex

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
          value: tenAmountDistance,
          label: formatMoney(sliderAmounts[tenIndex]),
        },
        !smallManaAmounts && {
          value: hundredAmountDistance,
          label: formatMoney(sliderAmounts[hundredIndex]),
        },
        {
          value: 100,
          label: formatMoney(sliderAmounts[maxSliderIndex]),
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
