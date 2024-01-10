import { MinusIcon, PlusIcon } from '@heroicons/react/solid'

import { BinaryOutcomes } from 'web/components/bet/bet-panel'
import { Slider } from 'web/components/widgets/slider'
import { formatMoney } from 'common/util/format'
import { buildArray } from 'common/util/array'
import clsx from 'clsx'
import { Row } from '../layout/row'

const largerSliderAmounts = [
  1, 2, 5, 10, 15, 20, 25, 35, 50, 75, 100, 150, 200, 250, 350, 500, 750, 1000,
]
const lowerManaSliderAmounts = [
  1, 2, 3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100,
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

  const maxInterval = smallManaAmounts ? 25 : 250
  const increment = () => {
    if (sliderIndex === maxSliderIndex) {
      onAmountChange((amount ?? 0) + maxInterval)
    } else onAmountChange(sliderAmounts[sliderIndex + 1])
  }
  const decrement = () => {
    if (
      sliderIndex === maxSliderIndex &&
      (amount ?? 0) > sliderAmounts[sliderIndex]
    ) {
      onAmountChange((amount ?? 0) - maxInterval)
    } else onAmountChange(sliderAmounts[Math.max(0, sliderIndex - 1)])
  }

  return (
    <Row className={clsx('w-full items-center gap-4', className)}>
      <button
        className={clsx(
          'text-ink-0 flex h-11 w-12 flex-row items-center justify-center rounded',
          binaryOutcome === 'YES' && 'bg-teal-400 active:bg-teal-500',
          binaryOutcome === 'NO' && 'bg-scarlet-400 active:bg-scarlet-500'
        )}
        onClick={decrement}
      >
        <MinusIcon className="h-5 w-5" />
      </button>
      <Slider
        className="-mt-3 flex-1"
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
      <button
        className={clsx(
          'text-ink-0 flex h-11 w-12 flex-row items-center justify-center rounded',
          binaryOutcome === 'YES' && 'bg-teal-400 active:bg-teal-500',
          binaryOutcome === 'NO' && 'bg-scarlet-400 active:bg-scarlet-500'
        )}
        onClick={increment}
      >
        <PlusIcon className="h-5 w-5" />
      </button>
    </Row>
  )
}
