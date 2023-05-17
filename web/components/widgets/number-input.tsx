import clsx from 'clsx'
import { ReactNode, useState } from 'react'

import React from 'react'
import { Col } from '../layout/col'
import { Spacer } from '../layout/spacer'
import { Input } from './input'

export function NumberInput(props: {
  isSubmitting?: boolean
  onChange: (value?: number) => void
  placeholder?: string
}) {
  const { isSubmitting, placeholder } = props

  const [numberString, setNumberString] = useState('')

  const stringOnChange = (s: string) => {
    setNumberString(s)

    const value = parseFloat(s)

    if (!isFinite(value)) {
      props.onChange(undefined)
      return
    }

    props.onChange(value)
  }

  return (
    <BaseNumberInput
      onChange={stringOnChange}
      error={undefined}
      disabled={isSubmitting}
      numberString={numberString}
      placeholder={placeholder}
    />
  )
}

function BaseNumberInput(props: {
  numberString: string
  onChange: (newNumberString: string) => void
  error: string | undefined
  disabled?: boolean
  placeholder?: string
  className?: string
  inputClassName?: string
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
    inputClassName,
    inputRef,
    children,
  } = props

  return (
    <Col>
      <Input
        className={clsx('!text-lg', inputClassName)}
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
