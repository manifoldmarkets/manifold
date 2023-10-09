import clsx from 'clsx'
import {
  CPMMBinaryContract,
  CPMMMultiContract,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import { Col } from '../layout/col'
import { Input } from './input'
import { AmountInput } from './amount-input'

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
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            onProbChange(`${Math.min(99, (prob ?? 0) + 1)}`)
          } else if (e.key === 'ArrowDown') {
            onProbChange(`${Math.max(0, (prob ?? 0) - 1)}`)
          }
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
    | CPMMBinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
  prob: number | undefined
  setProb: (prob: number | undefined) => void
  disabled?: boolean
  placeholder?: string
  error?: boolean
  onRangeError?: (error: boolean) => void
}) {
  const {
    contract,
    prob,
    setProb,
    disabled,
    placeholder,
    error = false,
    onRangeError,
  } = props
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'

  return isPseudoNumeric ? (
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
    <ProbabilityInput
      className={'w-24'}
      prob={prob}
      onChange={setProb}
      disabled={disabled}
      placeholder={placeholder}
      error={error}
    />
  )
}
