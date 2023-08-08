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
      className="mb-1 w-full"
      min={0}
      max={rangeMax ?? maximumAmount}
      marks={
        maximumAmount || rangeMin || rangeMax
          ? { '0': formatMoney(0) }
          : {
              '0': formatMoney(0),
              '50': formatMoney(50),
              '100': formatMoney(100),
            }
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
