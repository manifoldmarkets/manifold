import clsx from 'clsx'
import { ReactNode } from 'react'

import React from 'react'
import { Col } from './layout/col'
import { Spacer } from './layout/spacer'

export function NumberInput(props: {
  numberString: string
  onChange: (newNumberString: string) => void
  error: string | undefined
  label: string
  disabled?: boolean
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
    label,
    disabled,
    className,
    inputClassName,
    inputRef,
    children,
  } = props

  return (
    <Col className={className}>
      <label className="input-group">
        <span className="bg-gray-200 dark:bg-gray-800 text-sm">{label}</span>
        <input
          className={clsx(
            'input input-bordered max-w-[200px] text-lg',
            error && 'input-error',
            inputClassName
          )}
          ref={inputRef}
          type="number"
          placeholder="0"
          maxLength={9}
          value={numberString}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.substring(0, 9))}
        />
      </label>

      <Spacer h={4} />

      {error && (
        <div className="mb-2 mr-auto self-center whitespace-nowrap text-xs font-medium tracking-wide text-red-500">
          {error}
        </div>
      )}

      {children}
    </Col>
  )
}
