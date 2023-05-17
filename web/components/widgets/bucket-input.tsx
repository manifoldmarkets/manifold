import { useState } from 'react'

import { NumberInput } from './number-input'

export function BucketInput(props: {
  isSubmitting?: boolean
  onBucketChange: (value?: number) => void
  placeholder?: string
}) {
  const { isSubmitting, onBucketChange, placeholder } = props

  const [numberString, setNumberString] = useState('')

  const onChange = (s: string) => {
    setNumberString(s)

    const value = parseFloat(s)

    if (!isFinite(value)) {
      onBucketChange(undefined)
      return
    }

    onBucketChange(value)
  }

  return (
    <NumberInput
      inputClassName="w-full max-w-none"
      onChange={onChange}
      error={undefined}
      disabled={isSubmitting}
      numberString={numberString}
      placeholder={placeholder}
    />
  )
}
