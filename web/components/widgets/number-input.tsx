import clsx from 'clsx'
import { ReactNode } from 'react'
import { Col } from '../layout/col'
import { Spacer } from '../layout/spacer'
import { Input } from './input'

export function NumberInput(props: {
  numberString: string
  onChange: (newNumberString: string) => void
  error: string | undefined
  disabled?: boolean
  placeholder?: string
  className?: string
  // Needed to focus the amount input
  inputRef?: React.MutableRefObject<any>
  children?: ReactNode
}) {
  const {
    numberString,
    onChange,
    error,
    disabled,
    placeholder,
    className,
    inputRef,
    children,
  } = props

  return (
    <Col className={className}>
      <Input
        className={clsx('w-full !text-lg')}
        ref={inputRef}
        type="text"
        pattern="[0-9]*"
        inputMode="numeric"
        placeholder={placeholder ?? '0'}
        maxLength={12}
        value={numberString}
        error={!!error}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />

      <Spacer h={4} />

      {error && (
        <div className="text-scarlet-500 mb-2 mr-auto self-center whitespace-nowrap text-xs font-medium tracking-wide">
          {error}
        </div>
      )}

      {children}
    </Col>
  )
}

export function ControllableNumberInput(props: {
  num: number | undefined
  onChange: (newProb: number | undefined) => void
  minValue: number
  maxValue: number
  disabled?: boolean
  placeholder?: string
  className?: string
  error?: boolean
  inputError: boolean
  setInputError: (error: boolean) => void
}) {
  const {
    num,
    onChange,
    disabled,
    placeholder,
    className,
    minValue,
    maxValue,
    error,
    inputError,
    setInputError,
  } = props

  const onNumChange = (str: string) => {
    const n = parseInt(str.replace(/\D/g, ''))
    const isInvalid = !str || isNaN(n)
    if (n > maxValue || n < minValue) {
      setInputError(true)
    } else {
      setInputError(false)
    }
    onChange(isInvalid ? undefined : n)
  }

  return (
    <Input
      className={clsx('pr-2 !text-lg', 'w-full', className)}
      type="text"
      pattern="[0-9]*"
      inputMode="numeric"
      placeholder={placeholder ?? '0'}
      value={num ?? ''}
      disabled={disabled}
      onChange={(e) => onNumChange(e.target.value)}
      error={error || inputError}
    />
  )
}
