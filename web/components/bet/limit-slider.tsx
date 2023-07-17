import clsx from 'clsx'

import {
  CPMMBinaryContract,
  CPMMMultiContract,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import Slider from 'rc-slider'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { InfoTooltip } from '../widgets/info-tooltip'
import { ProbabilityOrNumericInput } from '../widgets/probability-input'

export function convertNumberToProb(
  number: number,
  isPseudoNumeric: boolean,
  min_prob: number,
  max_prob: number
) {
  if (isPseudoNumeric) {
    return ((number - min_prob) / (max_prob - min_prob)) * 100
  }
  return number
}

export function LimitSlider(props: {
  isPseudoNumeric: boolean
  contract:
    | CPMMBinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
  lowLimitProb: number | undefined
  setLowLimitProb: (prob: number | undefined) => void
  highLimitProb: number | undefined
  setHighLimitProb: (prob: number | undefined) => void
  maxProb: number
  minProb: number
  invalidLowAndHighBet: boolean
  disabled?: boolean
}) {
  const {
    isPseudoNumeric,
    contract,
    lowLimitProb,
    setLowLimitProb,
    highLimitProb,
    setHighLimitProb,
    maxProb,
    minProb,
    invalidLowAndHighBet,
    disabled,
  } = props

  const mark = (value: number) => (
    <span className="text-ink-400 text-xs">
      <div className={'sm:h-0.5'} />
      {value}%
    </span>
  )

  return (
    <Col className="relative mb-8 w-full gap-3">
      <div className="text-ink-800 text-sm">
        Select a {isPseudoNumeric ? 'numerical' : 'probability'} range to place
        bounding limit orders.{' '}
        <InfoTooltip text="Limit orders let you place an order to buy at a specific probability which other users can bet against" />
      </div>
      <Row className="w-full gap-3">
        <ProbabilityOrNumericInput
          contract={contract}
          prob={lowLimitProb}
          setProb={setLowLimitProb}
          disabled={disabled}
          placeholder={`${minProb}`}
          width={'w-full'}
        />
        <ProbabilityOrNumericInput
          contract={contract}
          prob={highLimitProb}
          setProb={setHighLimitProb}
          disabled={disabled}
          placeholder={`${maxProb}`}
          width={'w-full'}
          error={invalidLowAndHighBet}
        />
      </Row>
      <Col className="px-2">
        <Slider
          range
          disabled={disabled}
          marks={
            isPseudoNumeric
              ? undefined
              : {
                  0: mark(minProb),
                  50: mark(50),
                  100: mark(maxProb),
                }
          }
          value={[lowLimitProb ?? minProb, highLimitProb ?? maxProb]}
          min={minProb}
          max={maxProb}
          onChange={(value) => {
            if (value && Array.isArray(value)) {
              // eslint-disable-next-line prefer-const
              let [low, high] = value
              if (low === high) high++
              setLowLimitProb(low === minProb ? undefined : low)
              setHighLimitProb(high === maxProb ? undefined : high)
            }
          }}
          className={clsx(
            '[&>.rc-slider-rail]:bg-ink-200 my-auto !h-1',
            '[&>.rc-slider-handle]:z-10',
            invalidLowAndHighBet
              ? '[&>.rc-slider-track]:bg-scarlet-500'
              : '[&>.rc-slider-track]:bg-primary-300'
          )}
          handleStyle={[
            {
              height: 20,
              width: 20,
              opacity: 1,
              border: 'none',
              boxShadow: 'none',
              top: 2,
              backgroundColor: invalidLowAndHighBet ? '#FF2400' : '#6366f1',
            },
            {
              height: 20,
              width: 20,
              opacity: 1,
              border: 'none',
              boxShadow: 'none',
              top: 2,
              backgroundColor: '#6366f1',
            },
          ]}
        />
      </Col>
      {invalidLowAndHighBet && (
        <div
          className={clsx(
            'text-scarlet-500 dark:text-scarlet-300 absolute -bottom-12 text-sm'
          )}
        >
          * Upper limit must be higher than lower limit.{' '}
          <span>
            <button
              className="font-semibold text-indigo-500 underline"
              onClick={() => {
                if (lowLimitProb == highLimitProb) {
                  setHighLimitProb(
                    Math.min((lowLimitProb ?? minProb) + 5, maxProb)
                  )
                } else {
                  const tempLow = lowLimitProb
                  const tempHigh = highLimitProb
                  setLowLimitProb(tempHigh)
                  setHighLimitProb(tempLow)
                }
              }}
            >
              Swap
            </button>
          </span>
        </div>
      )}
    </Col>
  )
}
