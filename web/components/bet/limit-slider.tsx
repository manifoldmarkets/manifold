import clsx from 'clsx'

import {
  CPMMBinaryContract,
  CPMMMultiContract,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { InfoTooltip } from '../widgets/info-tooltip'
import { ProbabilityOrNumericInput } from '../widgets/probability-input'
import { RangeSlider } from '../widgets/slider'

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
  inputError: boolean
  setInputError: (error: boolean) => void
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
    inputError,
    setInputError,
  } = props

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
          inputError={inputError}
          setInputError={setInputError}
        />
        <ProbabilityOrNumericInput
          contract={contract}
          prob={highLimitProb}
          setProb={setHighLimitProb}
          disabled={disabled}
          placeholder={`${maxProb}`}
          width={'w-full'}
          error={invalidLowAndHighBet}
          inputError={inputError}
          setInputError={setInputError}
        />
      </Row>
      <RangeSlider
        min={minProb}
        max={maxProb}
        className="px-2 pt-1"
        lowValue={lowLimitProb ?? minProb}
        highValue={highLimitProb ?? maxProb}
        setValues={(low, high) => {
          setLowLimitProb(low === minProb ? undefined : low)
          setHighLimitProb(high === maxProb ? undefined : high)
        }}
        marks={
          isPseudoNumeric ? undefined : { 0: '0%', 50: '50%', 100: '100%' }
        }
        error={invalidLowAndHighBet}
      />
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
