import { useState } from 'react'

import { NumericContract } from 'common/contract'
import { getMappedBucket } from 'common/calculate-dpm'

import { NumberInput } from './number-input'

export function BucketInput(props: {
  contract: NumericContract
  isSubmitting?: boolean
  onBucketChange: (value?: number, bucket?: string) => void
}) {
  const { contract, isSubmitting, onBucketChange } = props

  const [numberString, setNumberString] = useState('')

  const onChange = (s: string) => {
    setNumberString(s)

    const value = parseFloat(s)

    if (!isFinite(value)) {
      onBucketChange(undefined, undefined)
      return
    }

    const bucket = getMappedBucket(value, contract)

    onBucketChange(value, bucket)
  }

  return (
    <NumberInput
      inputClassName="w-full max-w-none"
      onChange={onChange}
      error={undefined}
      disabled={isSubmitting}
      numberString={numberString}
      label="Value"
    />
  )
}
