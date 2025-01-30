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
import { Slider, sliderColors } from './slider'
import { AmountInput } from 'web/components/widgets/amount-input'
export const PROBABILITY_SLIDER_VALUES = Array.from(
  { length: 99 },
  (_, i) => i + 1
)

export const PROBABILITY_SLIDER_VALUE_LABELS = [1, 50, 99]

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
  const color = props.color ?? 'gray'

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
      fillToRight={outcome === 'NO'}
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
  } = props
  const maxBetProbInt = 100 * (limitProbs?.max ?? 0.99)
  const minBetProbInt = 100 * (limitProbs?.min ?? 0.01)
  const onProbChange = (str: string) => {
    let prob = parseInt(str.replace(/\D/g, ''))
    const isInvalid = !str || isNaN(prob)
    if (prob.toString().length > 2) {
      if (prob > maxBetProbInt) prob = maxBetProbInt
      else if (prob < minBetProbInt) prob = minBetProbInt
      else prob = +prob.toString().slice(-2)
    }
    onChange(isInvalid ? undefined : prob)
  }

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
        className={clsx('w-full !text-lg', inputClassName)}
        type="text"
        pattern="[0-9]*"
        inputMode="numeric"
        maxLength={2}
        placeholder={placeholder ?? '0'}
        value={prob ?? ''}
        disabled={disabled}
        onChange={(e) => onProbChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') adjustProb(1)
          else if (e.key === 'ArrowDown') adjustProb(-1)
        }}
        error={error}
      />
      <span className="text-ink-400 absolute right-4 top-1/2 my-auto -translate-y-1/2">
        %
      </span>
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
