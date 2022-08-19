import clsx from 'clsx'
import React from 'react'
import { useUser } from 'web/hooks/use-user'
import { formatMoney } from 'common/util/format'
import { Col } from './layout/col'
import { SiteLink } from './site-link'
import { ENV_CONFIG } from 'common/envs/constants'

export function AmountInput(props: {
  amount: number | undefined
  onChange: (newAmount: number | undefined) => void
  error: string | undefined
  label: string
  disabled?: boolean
  className?: string
  inputClassName?: string
  // Needed to focus the amount input
  inputRef?: React.MutableRefObject<any>
}) {
  const {
    amount,
    onChange,
    error,
    label,
    disabled,
    className,
    inputClassName,
    inputRef,
  } = props

  const onAmountChange = (str: string) => {
    const amount = parseInt(str.replace(/\D/g, ''))
    const isInvalid = !str || isNaN(amount)
    onChange(isInvalid ? undefined : amount)
  }

  return (
    <Col className={className}>
      <label className="input-group mb-4">
        <span className="bg-gray-200 text-sm">{label}</span>
        <input
          className={clsx(
            'input input-bordered max-w-[200px] text-lg placeholder:text-gray-400',
            error && 'input-error',
            inputClassName
          )}
          ref={inputRef}
          type="text"
          pattern="[0-9]*"
          inputMode="numeric"
          placeholder="0"
          maxLength={6}
          value={amount ?? ''}
          disabled={disabled}
          onChange={(e) => onAmountChange(e.target.value)}
        />
      </label>

      {error && (
        <div className="mb-2 mr-auto self-center whitespace-nowrap text-xs font-medium tracking-wide text-red-500">
          {error === 'Insufficient balance' ? (
            <>
              Not enough funds.
              <span className="ml-1 text-indigo-500">
                <SiteLink href="/add-funds">Buy more?</SiteLink>
              </span>
            </>
          ) : (
            error
          )}
        </div>
      )}
    </Col>
  )
}

export function BuyAmountInput(props: {
  amount: number | undefined
  onChange: (newAmount: number | undefined) => void
  error: string | undefined
  setError: (error: string | undefined) => void
  minimumAmount?: number
  disabled?: boolean
  className?: string
  inputClassName?: string
  // Needed to focus the amount input
  inputRef?: React.MutableRefObject<any>
}) {
  const {
    amount,
    onChange,
    error,
    setError,
    disabled,
    className,
    inputClassName,
    minimumAmount,
    inputRef,
  } = props

  const user = useUser()

  const onAmountChange = (amount: number | undefined) => {
    onChange(amount)

    // Check for errors.
    if (amount !== undefined) {
      if (user && user.balance < amount) {
        setError('Insufficient balance')
      } else if (minimumAmount && amount < minimumAmount) {
        setError('Minimum amount: ' + formatMoney(minimumAmount))
      } else {
        setError(undefined)
      }
    } else {
      setError(undefined)
    }
  }

  return (
    <AmountInput
      amount={amount}
      onChange={onAmountChange}
      label={ENV_CONFIG.moneyMoniker}
      error={error}
      disabled={disabled}
      className={className}
      inputClassName={inputClassName}
      inputRef={inputRef}
    />
  )
}
