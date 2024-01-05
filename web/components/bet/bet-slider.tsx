import { BinaryOutcomes } from 'web/components/bet/bet-panel'
import { Slider } from 'web/components/widgets/slider'
import { formatMoney } from 'common/util/format'
import { Col } from '../layout/col'

const largerSliderAmounts = [
  0, 1, 2, 5, 10, 15, 20, 25, 35, 50, 75, 100, 150, 200, 250, 300, 500, 750,
  1000,
]
const lowerManaSliderAmounts = [
  0, 1, 2, 3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100,
]
export const BetSlider = (props: {
  amount: number | undefined
  onAmountChange: (newAmount: number | undefined) => void
  smallManaAmounts?: boolean
  binaryOutcome?: BinaryOutcomes
  disabled?: boolean
}) => {
  const { amount, onAmountChange, smallManaAmounts, binaryOutcome, disabled } =
    props
  const sliderAmounts = smallManaAmounts
    ? lowerManaSliderAmounts
    : largerSliderAmounts
  const maxSliderIndex = sliderAmounts.length - 1
  const amountToSliderIndex = (amount: number) => {
    const index = sliderAmounts.findIndex((a) => amount <= a)
    return index === -1 ? maxSliderIndex : index
  }

  const sliderIndex = amountToSliderIndex(amount ?? 0)

  return (
    <Col className="w-full gap-4">
      <Slider
        min={0}
        max={maxSliderIndex}
        marks={[
          { value: 0, label: formatMoney(sliderAmounts[0]) },
          {
            value: 50,
            label: formatMoney(sliderAmounts[Math.floor(maxSliderIndex / 2)]),
          },
          {
            value: 100,
            label: formatMoney(sliderAmounts[maxSliderIndex]),
          },
        ]}
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
    </Col>
  )
}
