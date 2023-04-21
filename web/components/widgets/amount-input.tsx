import clsx from 'clsx'
import React, { ReactNode, useEffect, useState } from 'react'
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
  quickAddMoreButton?: ReactNode
  allowFloat?: boolean
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
    quickAddMoreButton,
    allowFloat,
  } = props

  const parse = (str: string) =>
    !allowFloat
      ? parseInt(str.replace(/\D/g, ''))
      : parseFloat(str.replace(/[^0-9.]/g, ''))

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
              type={allowFloat ? 'number' : 'text'}
              inputMode={allowFloat ? 'decimal' : 'numeric'}
              step={allowFloat ? 'any' : '1'}
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
            {quickAddMoreButton}
          </div>
        </label>
      </Col>
    </>
  )
}
export const quickAddMoreButtonClassName =
  'absolute right-px top-px bottom-px rounded-r-md px-2.5 transition-colors'
export function BuyAmountInput(props: {
  amount: number | undefined
  onChange: (newAmount: number | undefined) => void
  error: string | undefined
  setError: (error: string | undefined) => void
  minimumAmount?: number
  quickAddAmount?: number
  disabled?: boolean
  showBalance?: boolean
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
    quickAddAmount = 10,
    inputRef,
    binaryOutcome,
  } = props
  const { show, wrap } = sliderOptions ?? {}

  const user = useUser()

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

  const quickAddButton = (
    <button
      className={clsx(
        quickAddMoreButtonClassName,
        binaryOutcome === 'YES'
          ? 'text-teal-500 hover:bg-teal-100'
          : binaryOutcome === 'NO'
          ? 'text-scarlet-300 hover:bg-scarlet-50'
          : 'text-ink-500 hover:bg-ink-200'
      )}
      onClick={() => onChange((amount ?? 0) + quickAddAmount)}
    >
      +{quickAddAmount}
    </button>
  )

  return (
    <>
      <Col>
        <Row
          className={clsx(
            'items-center justify-between gap-x-4 gap-y-1 sm:justify-start',
            wrap ? 'flex-wrap' : ''
          )}
        >
          <AmountInput
            amount={amount}
            onChange={onChange}
            label={ENV_CONFIG.moneyMoniker}
            error={error}
            disabled={disabled}
            className={className}
            inputClassName={clsx('pr-12', inputClassName)}
            inputRef={inputRef}
            quickAddMoreButton={quickAddButton}
          />
          {show && (
            <BetSlider
              amount={amount}
              onAmountChange={onChange}
              binaryOutcome={binaryOutcome}
            />
          )}
        </Row>
        {error ? (
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
