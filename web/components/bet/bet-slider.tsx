import clsx from 'clsx'

import { BinaryOutcomes } from 'web/components/bet/bet-panel'
import { Slider } from 'web/components/widgets/slider'
import { formatMoney } from 'common/util/format'
import { Row } from '../layout/row'
import { ENV_CONFIG } from 'common/envs/constants'
import { Col } from '../layout/col'

const SCALE_VALUES = [100, 1000, 10000]

export const BetSlider = (props: {
  amount: number | undefined
  onAmountChange: (newAmount: number | undefined) => void
  scale: number
  setScale?: (newScale: number) => void
  binaryOutcome?: BinaryOutcomes
  maximumAmount?: number
  customRange?: { rangeMin?: number; rangeMax?: number }
  disabled?: boolean
}) => {
  const {
    amount,
    onAmountChange,
    scale,
    setScale,
    binaryOutcome,
    maximumAmount,
    disabled,
  } = props
  const { rangeMin, rangeMax } = props.customRange ?? {}

  return (
    <Col className="w-full gap-4">
      <Slider
        min={0}
        max={rangeMax ?? maximumAmount ?? scale}
        marks={
          maximumAmount || rangeMin || rangeMax
            ? [{ value: 0, label: formatMoney(0) }]
            : [
                { value: 0, label: formatMoney(0) },
                { value: 50, label: formatMoney(scale / 2) },
                { value: 100, label: formatMoney(scale) },
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
        step={scale / 20}
        disabled={disabled}
      />

      {setScale && (
        <Row className="text-ink-400 items-center gap-2 self-center">
          <div className="text-xs">Scale</div>
          {SCALE_VALUES.map((scaleValue) => (
            <div
              key={scaleValue}
              className={clsx(
                'cursor-pointer text-xs hover:text-indigo-500 hover:underline ',
                scale === scaleValue && 'font-bold underline'
              )}
              onClick={() => setScale(scaleValue)}
            >
              {ENV_CONFIG.moneyMoniker}
              {scaleValue >= 1000 ? scaleValue / 1000 + 'k' : scaleValue}
            </div>
          ))}
        </Row>
      )}
    </Col>
  )
}
