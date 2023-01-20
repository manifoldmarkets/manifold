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
import { Button, ColorType } from 'web/components/buttons/button'

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
  showQuickAddColor?: ColorType
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
    showQuickAddColor,
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
          <span className="absolute top-1/2 my-auto ml-2 -translate-y-1/2 text-gray-400">
            {label}
          </span>
          <Row>
            <Input
              className={clsx(
                'pl-9 !text-lg',
                showQuickAddColor && 'pr-12',
                inputClassName
              )}
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
            {showQuickAddColor && (
              <Button
                size={'xs'}
                color={showQuickAddColor}
                className={clsx(
                  '-ml-11 rounded-l-none',
                  showQuickAddColor === 'gray-white' && 'text-gray-400'
                )}
                onClick={() => onChange((amount ?? 0) + 10)}
              >
                +10
              </Button>
            )}
          </Row>
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
  showSlider?: boolean
  hideInput?: boolean
  className?: string
  inputClassName?: string
  // Needed to focus the amount input
  inputRef?: React.MutableRefObject<any>
  binaryOutcome?: binaryOutcomes
}) {
  const {
    amount,
    onChange,
    error,
    setError,
    showSlider,
    disabled,
    className,
    inputClassName,
    minimumAmount,
    inputRef,
    binaryOutcome,
    hideInput,
  } = props

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
            'items-center gap-x-4 gap-y-1 xl:flex-wrap',
            hideInput ? 'mb-4' : ''
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
              inputClassName={inputClassName}
              inputRef={inputRef}
              showQuickAddColor={
                binaryOutcome === 'YES'
                  ? 'green-white'
                  : binaryOutcome === 'NO'
                  ? 'red-white'
                  : 'gray-white'
              }
            />
          )}
          {showSlider && (
            <BetSlider
              amount={amount}
              onAmountChange={onAmountChange}
              binaryOutcome={binaryOutcome}
            />
          )}
        </Row>
        {hideInput && error && (
          <div className="text-scarlet-500 whitespace-nowrap text-xs font-medium tracking-wide">
            {error === 'Insufficient balance' ? <BuyMoreFunds /> : error}
          </div>
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
        className="ml-1 text-indigo-500 hover:underline hover:decoration-indigo-400"
        onClick={() => setAddFundsModalOpen(true)}
      >
        Buy more?
      </button>
      <AddFundsModal open={addFundsModalOpen} setOpen={setAddFundsModalOpen} />
    </>
  )
}
