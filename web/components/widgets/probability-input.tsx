import clsx from 'clsx'
import {
  CPMMBinaryContract,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import { getPseudoProbability } from 'common/pseudo-numeric'
import { Input } from './input'
import { NumberInput } from './number-input'
import { Col } from '../layout/col'

export function ProbabilityInput(props: {
  prob: number | undefined
  onChange: (newProb: number | undefined) => void
  disabled?: boolean
  placeholder?: string
  inputClassName?: string
}) {
  const { prob, onChange, disabled, placeholder, inputClassName } = props

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
    <Col>
      <label className="relative w-fit">
        <Input
          className={clsx('pr-2 !text-lg', inputClassName)}
          type="text"
          pattern="[0-9]*"
          inputMode="numeric"
          maxLength={2}
          placeholder={placeholder ?? '0'}
          value={prob ?? ''}
          disabled={disabled}
          onChange={(e) => onProbChange(e.target.value)}
        />
        <span className="text-ink-400 absolute top-1/2 right-4 my-auto -translate-y-1/2">
          %
        </span>
      </label>
    </Col>
  )
}

export function ProbabilityOrNumericInput(props: {
  contract: CPMMBinaryContract | PseudoNumericContract | StonkContract
  prob: number | undefined
  setProb: (prob: number | undefined) => void
  isSubmitting: boolean
  placeholder?: string
}) {
  const { contract, prob, setProb, isSubmitting, placeholder } = props
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'

  return isPseudoNumeric ? (
    <NumberInput
      onChange={(value) =>
        setProb(
          value === undefined
            ? undefined
            : 100 *
                getPseudoProbability(
                  value,
                  contract.min,
                  contract.max,
                  contract.isLogScale
                )
        )
      }
      disabled={isSubmitting}
      placeholder={placeholder}
    />
  ) : (
    <ProbabilityInput
      inputClassName="w-24"
      prob={prob}
      onChange={setProb}
      disabled={isSubmitting}
      placeholder={placeholder}
    />
  )
}
