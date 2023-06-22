import clsx from 'clsx'
import {
  CPMMBinaryContract,
  CPMMMultiContract,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import { Col } from '../layout/col'
import { Input } from './input'
import { ControllableNumberInput } from './number-input'

export function ProbabilityInput(props: {
  prob: number | undefined
  onChange: (newProb: number | undefined) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  inputClassName?: string
  error?: boolean
}) {
  const {
    prob,
    onChange,
    disabled,
    placeholder,
    className,
    inputClassName,
    error,
  } = props

  const onProbChange = (str: string) => {
    let prob = parseInt(str.replace(/\D/g, ''))
    const isInvalid = !str || isNaN(prob)
    if (prob.toString().length > 2) {
      if (prob === 100) prob = 99
      else if (prob < 1) prob = 1
      else prob = +prob.toString().slice(-2)
    }
    onChange(isInvalid ? undefined : prob)
  }

  return (
    <Col className={clsx(className, 'relative')}>
      <Input
        className={clsx('pr-2 !text-lg', 'w-full', inputClassName)}
        type="text"
        pattern="[0-9]*"
        inputMode="numeric"
        maxLength={2}
        placeholder={placeholder ?? '0'}
        value={prob ?? ''}
        disabled={disabled}
        onChange={(e) => onProbChange(e.target.value)}
        error={error}
      />
      <span className="text-ink-400 absolute top-1/2 right-4 my-auto -translate-y-1/2">
        %
      </span>
    </Col>
  )
}

export function ProbabilityOrNumericInput(props: {
  contract:
    | CPMMBinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
  prob: number | undefined
  setProb: (prob: number | undefined) => void
  isSubmitting: boolean
  className?: string
  inputClassName?: string
  placeholder?: string
  width?: string
  error?: boolean
}) {
  const {
    contract,
    prob,
    setProb,
    isSubmitting,
    placeholder,
    className,
    inputClassName,
    width = 'w-24',
    error,
  } = props
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'

  return isPseudoNumeric ? (
    <ControllableNumberInput
      num={prob}
      className={clsx(className, width, inputClassName)}
      onChange={setProb}
      minValue={contract.min}
      maxValue={contract.max}
      disabled={isSubmitting}
      placeholder={placeholder}
      error={error}
    />
  ) : (
    <ProbabilityInput
      className={clsx(className, width)}
      inputClassName={inputClassName}
      prob={prob}
      onChange={setProb}
      disabled={isSubmitting}
      placeholder={placeholder}
      error={error}
    />
  )
}
