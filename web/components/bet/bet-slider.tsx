import { binaryOutcomes } from 'web/components/bet/bet-panel'
import { Slider } from 'web/components/widgets/slider'
import { formatMoney } from 'common/util/format'

export const BetSlider = (props: {
  amount: number | undefined
  onAmountChange: (newAmount: number | undefined) => void
  binaryOutcome?: binaryOutcomes
  maximumAmount?: number
  customRange?: { rangeMin?: number; rangeMax?: number }
  disabled?: boolean
}) => {
  const { amount, onAmountChange, binaryOutcome, maximumAmount, disabled } =
    props
  const { rangeMin, rangeMax } = props.customRange ?? {}

  return (
    <Slider
      className="mb-2 w-full"
      min={0}
      max={rangeMax ?? maximumAmount}
      marks={
        maximumAmount || rangeMin || rangeMax
          ? [{ value: 0, label: formatMoney(0) }]
          : [
              { value: 0, label: formatMoney(0) },
              { value: 50, label: formatMoney(50) },
              { value: 100, label: formatMoney(100) },
            ]
      }
      color={
        binaryOutcome === 'YES'
          ? 'green'
          : binaryOutcome === 'NO'
          ? 'red'
          : 'indigo'
      }
      amount={amount ?? 0}
      onChange={(value) => onAmountChange(value as number)}
      step={5}
      disabled={disabled}
    />
  )
}
