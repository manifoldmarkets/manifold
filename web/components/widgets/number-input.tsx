import clsx from 'clsx'
import { useState } from 'react'
import { Input } from './input'

export function NumberInput(props: {
  num: number | undefined
  onChange: (newNum: number | undefined) => void
  min?: number
  max?: number
  disabled?: boolean
  placeholder?: string
  className?: string
  error?: boolean
}) {
  const [inputError, setInputError] = useState(false)
  return (
    <ControllableNumberInput
      {...props}
      error={props.error || inputError}
      setError={setInputError}
    />
  )
}

export function ControllableNumberInput(props: {
  num: number | undefined
  onChange: (newNum: number | undefined) => void
  min?: number
  max?: number
  disabled?: boolean
  placeholder?: string
  className?: string
  error: boolean
  setError: (error: boolean) => void
}) {
  const {
    num,
    onChange,
    disabled,
    placeholder,
    className,
    min = -Infinity,
    max = Infinity,
    error,
    setError,
  } = props

  const onNumChange = (str: string) => {
    const n = parseInt(str)
    const isInvalid = !str || isNaN(n)
    if (n > max || n < min) {
      setError(true)
    } else {
      setError(false)
    }
    onChange(isInvalid ? undefined : n)
  }

  return (
    <Input
      className={clsx('w-full pr-2 !text-lg', className)}
      type="text"
      pattern="-?[0-9]*"
      inputMode="numeric"
      placeholder={placeholder ?? '0'}
      value={num ?? ''}
      disabled={disabled}
      onChange={(e) => onNumChange(e.target.value)}
      error={error}
    />
  )
}
