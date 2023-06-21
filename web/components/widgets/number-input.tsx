import clsx from 'clsx'
import { ReactNode } from 'react'

import React from 'react'
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
    className,
    inputClassName,
    inputRef,
    children,
  } = props

  return (
    <Col className={className}>
      <Input
        className={clsx(' max-w-[200px] !text-lg', inputClassName)}
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
