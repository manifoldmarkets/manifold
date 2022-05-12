import _ from 'lodash'
import { useState } from 'react'

import { NumericContract } from 'common/contract'
import { getMappedBucket } from 'common/calculate-dpm'

import { NumberInput } from './number-input'

export function BucketInput(props: {
  contract: NumericContract
  isSubmitting?: boolean
  onBucketChange: (bucket?: string) => void
}) {
  const { contract, isSubmitting, onBucketChange } = props

  const [numberString, setNumberString] = useState('')

  const onChange = (s: string) => {
    setNumberString(s)

    const value = parseFloat(s)

    const bucket = isFinite(value)
      ? getMappedBucket(value, contract)
      : undefined

    onBucketChange(bucket)
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
