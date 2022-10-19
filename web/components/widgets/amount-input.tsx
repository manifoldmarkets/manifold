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

  const [addFundsModalOpen, setAddFundsModalOpen] = useState(false)

  return (
    <>
      <Col className={clsx('relative', className)}>
        <label className="font-sm md:font-lg relative">
          <span className="text-greyscale-4 absolute top-1/2 my-auto ml-2 -translate-y-1/2">
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
          />
        </label>

        {error && (
          <div className="absolute -bottom-5 whitespace-nowrap text-xs font-medium tracking-wide text-red-500">
            {error === 'Insufficient balance' ? (
              <>
                Not enough funds.
                <button
                  className="ml-1 text-indigo-500 hover:underline hover:decoration-indigo-400"
                  onClick={() => setAddFundsModalOpen(true)}
                >
                  Buy more?
                </button>
                <AddFundsModal
                  open={addFundsModalOpen}
                  setOpen={setAddFundsModalOpen}
                />
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

  return (
    <>
      <Row className="items-center gap-4">
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
          <Slider
            min={0}
            max={100}
            value={amount ?? 0}
            onChange={(value) => onAmountChange(value as number)}
            className="mx-4 !h-4 xl:hidden [&>.rc-slider-rail]:bg-gray-200 [&>.rc-slider-track]:bg-indigo-400 [&>.rc-slider-handle]:bg-indigo-400"
            railStyle={{ height: 16, top: 0, left: 0 }}
            trackStyle={{ height: 16, top: 0 }}
            handleStyle={{
              height: 32,
              width: 32,
              opacity: 1,
              border: 'none',
              boxShadow: 'none',
              top: -2,
            }}
            step={5}
          />
        )}
      </Row>
    </>
  )
}
