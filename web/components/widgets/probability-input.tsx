import clsx from 'clsx'
import {
  BinaryContract,
  CPMMMultiContract,
  CPMMNumericContract,
  MAX_CPMM_PROB,
  MIN_CPMM_PROB,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import { Col } from '../layout/col'
import { Input } from './input'
import { AmountInput } from './amount-input'
import { Slider, sliderColors } from './slider'
import { Row } from '../layout/row'
export const PROBABILITY_SLIDER_VALUES = [
  1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95,
  99,
]

export const PROBABILITY_SLIDER_VALUE_LABELS = [1, 25, 50, 75, 99]

export function ProbabilitySlider(props: {
  prob: number | undefined
  onProbChange: (newProb: number | undefined) => void
  disabled?: boolean
  className?: string
  color?: keyof typeof sliderColors
  outcome?: 'YES' | 'NO'
}) {
  const { prob, onProbChange, disabled, className, outcome } = props
  // Default slider color: YES → green, NO → red
  const color = props.color ?? (outcome === 'NO' ? 'red' : 'green')

  const marks = PROBABILITY_SLIDER_VALUE_LABELS.map((p) => ({
    value: PROBABILITY_SLIDER_VALUES.findIndex((val) => val === p),
    label: `${p}%`,
  }))

  const maxSliderIndex = PROBABILITY_SLIDER_VALUES.length - 1

  const probToSliderIndex = (p: number) => {
    const idx = PROBABILITY_SLIDER_VALUES.findLastIndex((val) => p >= val)
    return idx === -1 ? 0 : idx
  }

  // Convert slider index back to the real probability
  const sliderIndexToProb = (idx: number) => PROBABILITY_SLIDER_VALUES[idx]

  return (
    <Slider
      className={className}
      min={0}
      max={maxSliderIndex}
      marks={marks}
      color={color}
      amount={probToSliderIndex(prob ?? 0)} // position the slider at the real probability
      onChange={(value) => onProbChange(sliderIndexToProb(value))}
      step={1}
      disabled={disabled}
    />
  )
}

export function ProbabilityInput(props: {
  prob: number | undefined
  onChange: (newProb: number | undefined) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  inputClassName?: string
  error?: boolean
  limitProbs?: { max: number; min: number }
  outcome?: 'YES' | 'NO'
}) {
  const {
    prob,
    onChange,
    disabled,
    placeholder,
    className,
    inputClassName,
    error,
    limitProbs,
    outcome,
  } = props
  const maxBetProbInt = 100 * (limitProbs?.max ?? 0.99)
  const minBetProbInt = 100 * (limitProbs?.min ?? 0.01)

  const adjustProb = (delta: number) => {
    const currentProb = prob ?? 0
    let newProb = currentProb + delta
    if (newProb <= minBetProbInt) newProb = minBetProbInt
    else if (newProb >= maxBetProbInt) newProb = maxBetProbInt
    onChange(newProb)
  }

  return (
    <Col className={clsx(className, 'relative')}>
      <Input
        className={clsx('pr-24 !text-lg', 'w-full', inputClassName)}
        type="text"
        pattern="[0-9]*"
        inputMode="numeric"
        maxLength={2}
        placeholder={placeholder ?? '0'}
        value={prob ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(parseInt(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') adjustProb(1)
          else if (e.key === 'ArrowDown') adjustProb(-1)
        }}
        error={error}
      />
      <span className="text-ink-400 absolute right-[106px] top-1/2 my-auto -translate-y-1/2">
        %
      </span>
      <div className="bg-ink-300 absolute right-[98px] h-full w-[1px]" />
      <Row className="divide-ink-300 absolute right-[1px] top-[1px] h-[calc(100%-2px)] divide-x text-sm">
        <Col className="divide-ink-300 divide-y">
          <button
            className="text-ink-400 hover:text-ink-500 active:text-ink-500 flex h-[35px] w-12 items-center justify-center"
            onClick={() => adjustProb(1)}
            disabled={disabled}
          >
            +1
          </button>
          <button
            className="text-ink-400 hover:text-ink-500 active:text-ink-500 flex h-[35px] w-12 items-center justify-center"
            onClick={() => adjustProb(-1)}
            disabled={disabled}
          >
            -1
          </button>
        </Col>
        <Col className="divide-ink-300 divide-y">
          <button
            className="text-ink-400 hover:text-ink-500 active:text-ink-500 flex h-[35px] w-12 items-center justify-center"
            onClick={() => adjustProb(5)}
            disabled={disabled}
          >
            +5
          </button>
          <button
            className="text-ink-400 hover:text-ink-500 active:text-ink-500 flex h-[35px] w-12 items-center justify-center"
            onClick={() => adjustProb(-5)}
            disabled={disabled}
          >
            -5
          </button>
        </Col>
      </Row>
    </Col>
  )
}

export function ProbabilityOrNumericInput(props: {
  contract:
    | BinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
    | CPMMNumericContract
  prob: number | undefined
  setProb: (prob: number | undefined) => void
  disabled?: boolean
  placeholder?: string
  error?: boolean
  onRangeError?: (error: boolean) => void
  showSlider?: boolean
  sliderColor?: keyof typeof sliderColors
  outcome?: 'YES' | 'NO'
}) {
  const {
    contract,
    prob,
    setProb,
    disabled,
    placeholder,
    error = false,
    onRangeError,
    showSlider,
    sliderColor,
    outcome,
  } = props
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'
  const isSumsToOne =
    contract.outcomeType === 'MULTIPLE_CHOICE' && contract.shouldAnswersSumToOne

  return (
    <Col className="gap-2">
      {isPseudoNumeric ? (
        <AmountInput
          inputClassName="w-24"
          label=""
          amount={prob}
          onChangeAmount={(val) => {
            onRangeError?.(
              val !== undefined && (val < contract.min || val > contract.max)
            )
            setProb(val)
          }}
          allowNegative
          disabled={disabled}
          placeholder={placeholder}
          error={error}
        />
      ) : (
        <>
          <ProbabilityInput
            className={'w-44'}
            inputClassName={'h-14'}
            prob={prob}
            onChange={setProb}
            disabled={disabled}
            placeholder={placeholder}
            error={error}
            limitProbs={
              !isSumsToOne
                ? { max: MAX_CPMM_PROB, min: MIN_CPMM_PROB }
                : undefined
            }
            outcome={outcome}
          />
          {showSlider && !isPseudoNumeric && (
            <ProbabilitySlider
              className="-mt-2 w-56"
              prob={prob}
              onProbChange={setProb}
              disabled={disabled}
              color={sliderColor}
              outcome={outcome}
            />
          )}
        </>
      )}
    </Col>
  )
}
