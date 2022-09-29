import clsx from 'clsx'
import React from 'react'
import { useUser } from 'web/hooks/use-user'
import { formatMoney } from 'common/util/format'
import { Col } from './layout/col'
import { SiteLink } from './site-link'
import { ENV_CONFIG } from 'common/envs/constants'
import { useWindowSize } from 'web/hooks/use-window-size'
import { Row } from './layout/row'

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

  const { width } = useWindowSize()
  const isMobile = (width ?? 0) < 768

  return (
    <>
      <Col className={className}>
        <label className="font-sm md:font-lg">
          <span className={clsx('text-greyscale-4 absolute ml-2 mt-[9px]')}>
            {label}
          </span>
          <input
            className={clsx(
              'placeholder:text-greyscale-4 border-greyscale-2 rounded-md pl-9',
              error && 'input-error',
              isMobile ? 'w-24' : '',
              inputClassName
            )}
            ref={inputRef}
            type="text"
            pattern="[0-9]*"
            inputMode="numeric"
            placeholder="0"
            maxLength={6}
            autoFocus={!isMobile}
            value={amount ?? ''}
            disabled={disabled}
            onChange={(e) => onAmountChange(e.target.value)}
          />
        </label>

        {error && (
          <div className="absolute mt-11 whitespace-nowrap text-xs font-medium tracking-wide text-red-500">
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
    </>
  )
}

export function BuyAmountInput(props: {
  amount: number | undefined
  onChange: (newAmount: number | undefined) => void
  error: string | undefined
  setError: (error: string | undefined) => void
  minimumAmount?: number
  disabled?: boolean
  showSliderOnMobile?: boolean
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
    showSliderOnMobile: showSlider,
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

  const parseRaw = (x: number) => {
    if (x <= 100) return x
    if (x <= 130) return 100 + (x - 100) * 5
    return 250 + (x - 130) * 10
  }

  const getRaw = (x: number) => {
    if (x <= 100) return x
    if (x <= 250) return 100 + (x - 100) / 5
    return 130 + (x - 250) / 10
  }

  return (
    <>
      <Row className="gap-4">
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
        {showSlider && (
          <input
            type="range"
            min="0"
            max="205"
            value={getRaw(amount ?? 0)}
            onChange={(e) => onAmountChange(parseRaw(parseInt(e.target.value)))}
            className="range range-lg only-thumb my-auto align-middle xl:hidden"
            step="5"
          />
        )}
      </Row>
    </>
  )
}
