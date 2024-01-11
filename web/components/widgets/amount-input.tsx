import clsx from 'clsx'
import { XIcon } from '@heroicons/react/solid'
import { MinusIcon, PlusIcon } from '@heroicons/react/solid'

import { ENV_CONFIG } from 'common/envs/constants'
import { formatMoney } from 'common/util/format'
import { ReactNode, useEffect, useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { AddFundsModal } from '../add-funds-modal'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Input } from './input'
import { useCurrentPortfolio } from 'web/hooks/use-portfolio-history'
import {
  BetSlider,
  DOUBLE_INCREMENT_COUNT,
  LARGE_SLIDER_VALUES,
  LOW_MANA_SLIDER_VALUES,
} from '../bet/bet-slider'

export function AmountInput(
  props: {
    amount: number | undefined
    onChangeAmount: (newAmount: number | undefined) => void
    error?: boolean
    label?: string
    disabled?: boolean
    className?: string
    inputClassName?: string
    // Needed to focus the amount input
    inputRef?: React.MutableRefObject<any>
    quickAddMoreButton?: ReactNode
    allowFloat?: boolean
    allowNegative?: boolean
  } & JSX.IntrinsicElements['input']
) {
  const {
    amount,
    onChangeAmount,
    error,
    label = ENV_CONFIG.moneyMoniker,
    disabled,
    className,
    inputClassName,
    inputRef,
    quickAddMoreButton,
    allowFloat,
    allowNegative,
    ...rest
  } = props

  const [amountString, setAmountString] = useState(amount?.toString() ?? '')

  const parse = allowFloat ? parseFloat : parseInt

  const bannedChars = new RegExp(
    `[^\\d${allowFloat && '.'}${allowNegative && '-'}]`,
    'g'
  )

  useEffect(() => {
    if (amount !== parse(amountString))
      setAmountString(amount?.toString() ?? '')
  }, [amount])

  const onAmountChange = (str: string) => {
    const s = str.replace(bannedChars, '')
    if (s !== amountString) {
      setAmountString(s)
      const amount = parse(s)
      const isInvalid = !s || isNaN(amount)
      onChangeAmount(isInvalid ? undefined : amount)
    }
  }

  return (
    <>
      <Col className={clsx('relative', className)}>
        <label className="font-sm md:font-lg relative">
          {label && (
            <span className="text-ink-400 absolute top-1/2 my-auto ml-2 -translate-y-1/2">
              {label}
            </span>
          )}
          <div className="flex">
            <Input
              {...rest}
              className={clsx(label && 'pl-9', ' !text-lg', inputClassName)}
              ref={inputRef}
              type={allowFloat ? 'number' : 'text'}
              inputMode={allowFloat ? 'decimal' : 'numeric'}
              placeholder="0"
              maxLength={9}
              value={amountString}
              error={error}
              disabled={disabled}
              onChange={(e) => onAmountChange(e.target.value)}
              onBlur={() => setAmountString(amount?.toString() ?? '')}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp') {
                  onChangeAmount((amount ?? 0) + 5)
                } else if (e.key === 'ArrowDown') {
                  onChangeAmount(Math.max(0, (amount ?? 0) - 5))
                }
              }}
            />
            <Row className="absolute right-0 h-full divide-x">
              {quickAddMoreButton}
              <ClearInputButton
                className={clsx(
                  'w-12 transition-opacity',
                  amount === undefined && 'opacity-0'
                )}
                onClick={() => onChangeAmount(undefined)}
              />
            </Row>
          </div>
        </label>
      </Col>
    </>
  )
}

function ClearInputButton(props: { onClick: () => void; className?: string }) {
  const { onClick, className } = props
  return (
    <button
      className={clsx(
        className,
        'text-ink-400 hover:text-ink-500 active:text-ink-500 flex items-center justify-center'
      )}
      onClick={onClick}
    >
      <XIcon className="h-4 w-4" />
    </button>
  )
}

export function BuyAmountInput(props: {
  amount: number | undefined
  onChange: (newAmount: number | undefined) => void
  error: string | undefined
  setError: (error: string | undefined) => void
  minimumAmount?: number
  maximumAmount?: number
  disabled?: boolean
  showBalance?: boolean
  parentClassName?: string
  binaryOutcome?: 'YES' | 'NO'
  showSlider?: boolean
  className?: string
  inputClassName?: string
  // Needed to focus the amount input
  inputRef?: React.MutableRefObject<any>
  disregardUserBalance?: boolean
}) {
  const {
    amount,
    onChange,
    error,
    setError,
    disabled,
    binaryOutcome,
    showBalance,
    showSlider,
    parentClassName,
    className,
    inputClassName,
    minimumAmount,
    inputRef,
    maximumAmount,
    disregardUserBalance,
  } = props
  const user = useUser()

  // Check for errors.
  useEffect(() => {
    if (amount !== undefined) {
      if (!disregardUserBalance && user && user.balance < amount) {
        setError('Insufficient balance')
      } else if (minimumAmount && amount < minimumAmount) {
        setError('Minimum amount: ' + formatMoney(minimumAmount))
      } else if (maximumAmount && amount > maximumAmount) {
        setError('Maximum amount: ' + formatMoney(maximumAmount))
      } else {
        setError(undefined)
      }
    } else {
      setError(undefined)
    }
  }, [amount, user, minimumAmount, maximumAmount, disregardUserBalance])

  const portfolio = useCurrentPortfolio(user?.id)
  const hasLotsOfMana =
    !!portfolio && portfolio.balance + portfolio.investmentValue > 2000

  const amountWithDefault = amount ?? 0
  const sliderAmounts = hasLotsOfMana
    ? LARGE_SLIDER_VALUES
    : LOW_MANA_SLIDER_VALUES
  const sliderIndex = sliderAmounts.findLastIndex((a) => amountWithDefault >= a)
  const maxSliderAmount = sliderAmounts[sliderAmounts.length - 1]

  const penultimateSliderAmount =
    sliderAmounts[sliderAmounts.length - DOUBLE_INCREMENT_COUNT]

  const maxInterval = hasLotsOfMana ? 250 : 25
  const decrement = () => {
    if (amountWithDefault >= maxSliderAmount) {
      onChange((amount ?? 0) - maxInterval)
    } else onChange(sliderAmounts[Math.max(0, sliderIndex - 1)])
  }

  const increment = () => {
    if (amountWithDefault >= maxSliderAmount) {
      onChange((amount ?? 0) + maxInterval)
    } else onChange(sliderAmounts[sliderIndex + 1])
  }
  const doubleIncrement = () => {
    if (amountWithDefault >= penultimateSliderAmount) {
      if (amountWithDefault >= maxSliderAmount)
        onChange(amountWithDefault + maxInterval * 2)
      else onChange(maxSliderAmount)
    } else onChange(sliderAmounts[sliderIndex + DOUBLE_INCREMENT_COUNT])
  }
  const buttonClasses =
    'text-ink-400 border-ink-300 flex h-14 w-12 flex-row items-center justify-center border bg-canvas-0 active:bg-ink-100'

  return (
    <>
      <Col className={clsx('max-w-[350px] gap-2', parentClassName)}>
        <Row className="items-center gap-2">
          <AmountInput
            className={className}
            inputClassName={clsx(
              '!h-14 w-full max-w-[300px] pr-[44px]',
              inputClassName
            )}
            amount={amount}
            onChangeAmount={onChange}
            label={ENV_CONFIG.moneyMoniker}
            error={!!error}
            disabled={disabled}
            inputRef={inputRef}
            quickAddMoreButton={undefined}
          />

          <Row>
            <button
              className={clsx(buttonClasses, 'rounded-l')}
              onClick={decrement}
            >
              <MinusIcon className="h-5 w-5" />
            </button>
            <button
              className={clsx(
                buttonClasses,
                'border-l-0',
                hasLotsOfMana ? 'border-r-0' : 'rounded-r'
              )}
              onClick={increment}
            >
              <PlusIcon className="h-5 w-5" />
            </button>
            {hasLotsOfMana && (
              <button
                className={clsx(buttonClasses, 'rounded-r')}
                onClick={doubleIncrement}
              >
                <PlusIcon className="h-4 w-4" />
                <PlusIcon className="h-4 w-4" />
              </button>
            )}
          </Row>
        </Row>

        {showSlider && (
          <BetSlider
            className="-mt-2"
            amount={amount}
            onAmountChange={onChange}
            binaryOutcome={binaryOutcome}
            disabled={disabled}
            smallManaAmounts={!hasLotsOfMana}
          />
        )}

        {error ? (
          <div className="text-scarlet-500 mt-4 whitespace-nowrap text-sm">
            {error === 'Insufficient balance' ? <BuyMoreFunds /> : error}
          </div>
        ) : (
          showBalance &&
          user && (
            <div className="text-ink-500 mt-4 whitespace-nowrap text-sm">
              Balance{' '}
              <span className="text-ink-800">{formatMoney(user.balance)}</span>
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
