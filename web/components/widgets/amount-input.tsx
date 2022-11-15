import clsx from 'clsx'
import React, { useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { formatMoney } from 'common/util/format'
import { Col } from '../layout/col'
import { ENV_CONFIG } from 'common/envs/constants'
import { Row } from '../layout/row'
import { AddFundsModal } from '../add-funds-modal'
import { Input } from './input'
import Slider from 'rc-slider'
import 'rc-slider/assets/index.css'
import { binaryOutcomes } from '../bet/bet-panel'

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
          <Input
            className={clsx('w-24 pl-9 !text-base md:w-auto', inputClassName)}
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

    // Check for errors.
    if (amount !== undefined) {
      if (user && user.balance < amount) {
        setError('Insufficient balance')
      } else if (minimumAmount && amount < minimumAmount) {
        setError('Minimum amount: ' + formatMoney(minimumAmount) + ' mana')
      } else {
        setError(undefined)
      }
    } else {
      setError(undefined)
    }
  }

  return (
    <>
      <Col>
        <Row
          className={clsx(
            'items-center gap-4 xl:flex-wrap',
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
            />
          )}
          {showSlider && (
            <Slider
              min={0}
              max={100}
              value={amount ?? 0}
              onChange={(value) => onAmountChange(value as number)}
              className={clsx(
                ' my-auto mx-2 !h-1 xl:mx-auto xl:mt-3 xl:ml-4  [&>.rc-slider-rail]:bg-gray-200',
                binaryOutcome === 'YES'
                  ? '[&>.rc-slider-track]:bg-teal-600 [&>.rc-slider-handle]:bg-teal-500'
                  : binaryOutcome === 'NO'
                  ? '[&>.rc-slider-track]:bg-scarlet-600 [&>.rc-slider-handle]:bg-scarlet-300'
                  : '[&>.rc-slider-track]:bg-indigo-700 [&>.rc-slider-handle]:bg-indigo-500'
              )}
              railStyle={{ height: 4, top: 4, left: 0 }}
              trackStyle={{ height: 4, top: 4 }}
              handleStyle={{
                height: 24,
                width: 24,
                opacity: 1,
                border: 'none',
                boxShadow: 'none',
                top: -0.5,
              }}
              step={5}
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
