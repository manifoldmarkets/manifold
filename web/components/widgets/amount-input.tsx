import clsx from 'clsx'
import React, { useEffect, useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { formatMoney } from 'common/util/format'
import { Col } from '../layout/col'
import { ENV_CONFIG } from 'common/envs/constants'
import { Row } from '../layout/row'
import { AddFundsModal } from '../add-funds-modal'
import { Input } from './input'
import 'rc-slider/assets/index.css'
import { binaryOutcomes } from '../bet/bet-panel'
import { BetSlider } from 'web/components/bet/bet-slider'

export function AmountInput(props: {
  amount: number | undefined
  onChange: (newAmount: number | undefined) => void
  error?: string
  label: string
  disabled?: boolean
  className?: string
  inputClassName?: string
  // Needed to focus the amount input
  inputRef?: React.MutableRefObject<any>
  quickAddClassName?: string
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
    quickAddClassName,
  } = props

  const parse = (str: string) => parseInt(str.replace(/\D/g, ''))

  const onAmountChange = (str: string) => {
    const amount = parse(str)
    const isInvalid = !str || isNaN(amount)
    onChange(isInvalid ? undefined : amount)
  }

  return (
    <>
      <Col className={clsx('relative', error && 'mb-3', className)}>
        <label className="font-sm md:font-lg relative">
          <span className="text-ink-400 absolute top-1/2 my-auto ml-2 -translate-y-1/2">
            {label}
          </span>
          <div className="flex">
            <Input
              className={clsx('pl-9 !text-lg', inputClassName)}
              ref={inputRef}
              type="text"
              pattern="[0-9]*"
              inputMode="numeric"
              placeholder="0"
              maxLength={6}
              value={amount ?? ''}
              error={!!error}
              disabled={disabled}
              onChange={(e) => onAmountChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp') {
                  onChange((amount ?? 0) + 5)
                } else if (e.key === 'ArrowDown') {
                  onChange(Math.max(0, (amount ?? 0) - 5))
                }
              }}
            />
            {quickAddClassName && (
              <button
                className={clsx(
                  'absolute right-px top-px bottom-px rounded-r-md px-2.5 transition-colors',
                  quickAddClassName
                )}
                onClick={() => onChange((amount ?? 0) + 10)}
              >
                +10
              </button>
            )}
          </div>
        </label>

        {error && (
          <div className="text-scarlet-500 absolute -bottom-5 whitespace-nowrap text-xs font-medium tracking-wide">
            {error === 'Insufficient balance' ? <BuyMoreFunds /> : error}
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
  showBalance?: boolean
  hideInput?: boolean
  className?: string
  inputClassName?: string
  // Needed to focus the amount input
  inputRef?: React.MutableRefObject<any>
  binaryOutcome?: binaryOutcomes
  sliderOptions?: {
    show: boolean
    wrap: boolean
  }
}) {
  const {
    amount,
    onChange,
    error,
    setError,
    sliderOptions,
    disabled,
    showBalance,
    className,
    inputClassName,
    minimumAmount,
    inputRef,
    binaryOutcome,
    hideInput,
  } = props
  const { show, wrap } = sliderOptions ?? {}

  const user = useUser()

  const onAmountChange = (amount: number | undefined) => {
    onChange(amount)
  }

  // Check for errors.
  useEffect(() => {
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
  })

  return (
    <>
      <Col>
        <Row
          className={clsx(
            'items-center justify-between gap-x-4 gap-y-1 sm:justify-start',
            hideInput ? 'mb-4' : '',
            wrap ? 'flex-wrap' : ''
          )}
        >
          {!hideInput && (
            <AmountInput
              amount={amount}
              onChange={onAmountChange}
              label={ENV_CONFIG.moneyMoniker}
              error={error}
              disabled={disabled}
              className={className}
              inputClassName={clsx('pr-12', inputClassName)}
              inputRef={inputRef}
              quickAddClassName={
                binaryOutcome === 'YES'
                  ? 'text-teal-500 hover:bg-teal-100'
                  : binaryOutcome === 'NO'
                  ? 'text-scarlet-300 hover:bg-scarlet-50'
                  : 'text-ink-500 hover:bg-ink-200'
              }
            />
          )}
          {show && (
            <BetSlider
              amount={amount}
              onAmountChange={onAmountChange}
              binaryOutcome={binaryOutcome}
            />
          )}
        </Row>
        {hideInput && error ? (
          <div className="text-scarlet-500 whitespace-nowrap text-xs font-medium tracking-wide">
            {error === 'Insufficient balance' ? <BuyMoreFunds /> : error}
          </div>
        ) : (
          showBalance &&
          user && (
            <div className="text-ink-500 whitespace-nowrap text-xs font-medium tracking-wide">
              Balance: {formatMoney(user.balance)}
            </div>
          )
        )}
      </Col>
    </>
  )
}

const BuyMoreFunds = () => {
  const [addFundsModalOpen, setAddFundsModalOpen] = useState(false)
  return (
    <>
      Not enough funds.
      <button
        className="text-primary-500 hover:decoration-primary-400 ml-1 hover:underline"
        onClick={() => setAddFundsModalOpen(true)}
      >
        Buy more?
      </button>
      <AddFundsModal open={addFundsModalOpen} setOpen={setAddFundsModalOpen} />
    </>
  )
}
