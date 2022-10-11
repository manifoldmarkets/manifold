import clsx from 'clsx'
import { CPMMBinaryContract, PseudoNumericContract } from 'common/contract'
import { getPseudoProbability } from 'common/pseudo-numeric'
import { BucketInput } from './bucket-input'
import { Input } from './input'
import { Col } from './layout/col'
import { Spacer } from './layout/spacer'

export function ProbabilityInput(props: {
  prob: number | undefined
  onChange: (newProb: number | undefined) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  inputClassName?: string
}) {
  const { prob, onChange, disabled, placeholder, className, inputClassName } =
    props

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
    <Col className={className}>
      <label className="input-group">
        <Input
          className={clsx('max-w-[200px] !text-lg', inputClassName)}
          type="number"
          max={99}
          min={1}
          pattern="[0-9]*"
          inputMode="numeric"
          placeholder={placeholder ?? '0'}
          maxLength={2}
          value={prob ?? ''}
          disabled={disabled}
          onChange={(e) => onProbChange(e.target.value)}
        />
        <span className="bg-gray-200 text-sm">%</span>
      </label>
      <Spacer h={4} />
    </Col>
  )
}

export function ProbabilityOrNumericInput(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  prob: number | undefined
  setProb: (prob: number | undefined) => void
  isSubmitting: boolean
  placeholder?: string
}) {
  const { contract, prob, setProb, isSubmitting, placeholder } = props
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'

  return isPseudoNumeric ? (
    <BucketInput
      contract={contract}
      onBucketChange={(value) =>
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
      isSubmitting={isSubmitting}
      placeholder={placeholder}
    />
  ) : (
    <ProbabilityInput
      inputClassName="w-full max-w-none"
      prob={prob}
      onChange={setProb}
      disabled={isSubmitting}
      placeholder={placeholder}
    />
  )
}
