import { useState } from 'react'

import { getMappedBucket } from 'common/calculate-dpm'
import { NumericContract, PseudoNumericContract } from 'common/contract'

import { NumberInput } from './number-input'

export function BucketInput(props: {
  contract: NumericContract | PseudoNumericContract
  isSubmitting?: boolean
  onBucketChange: (value?: number, bucket?: string) => void
  placeholder?: string
  className?: string
}) {
  const { contract, isSubmitting, onBucketChange, placeholder, className } =
    props

  const [numberString, setNumberString] = useState('')

  const onChange = (s: string) => {
    setNumberString(s)

    const value = parseFloat(s)

    if (!isFinite(value)) {
      onBucketChange(undefined, undefined)
      return
    }

    const bucket =
      contract.outcomeType === 'PSEUDO_NUMERIC'
        ? ''
        : getMappedBucket(value, contract)

    onBucketChange(value, bucket)
  }

  return (
    <NumberInput
      onChange={onChange}
      error={undefined}
      disabled={isSubmitting}
      numberString={numberString}
      placeholder={placeholder}
      className={className}
    />
  )
}
