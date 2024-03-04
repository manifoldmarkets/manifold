import clsx from 'clsx'
import { XIcon } from '@heroicons/react/solid'

import { ENV_CONFIG } from 'common/envs/constants'
import { formatMoney } from 'common/util/format'
import { ReactNode, useEffect, useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { AddFundsModal } from '../add-funds-modal'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Input } from './input'
import { useCurrentPortfolio } from 'web/hooks/use-portfolio-history'
import { BetSlider } from '../bet/bet-slider'
import { IncrementDecrementAmountButton } from './increment-button'
import { useIsAdvancedTrader } from 'web/hooks/use-is-advanced-trader'
import { ChoicesToggleGroup } from './choices-toggle-group'

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

  const isAdvancedTrader = useIsAdvancedTrader()

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
            <Row className="divide-ink-300 absolute right-[1px] h-full divide-x">
              <ClearInputButton
                className={clsx(
                  'w-12 transition-opacity',
                  amount === undefined && 'opacity-0'
                )}
                onClick={() => onChangeAmount(undefined)}
              />
              {isAdvancedTrader && quickAddMoreButton}
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
  quickButtonValues?: number[] | 'large'
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
    quickButtonValues,
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
  const quickAmounts = [10, 25, 100]
  const hasLotsOfMana =
    !!portfolio && portfolio.balance + portfolio.investmentValue > 2000

  const amountWithDefault = amount ?? 0

  const incrementBy = (increment: number) => {
    const newAmount = amountWithDefault + increment
    if (newAmount <= 0) onChange(undefined)
    else if (amountWithDefault < increment) onChange(increment)
    else onChange(newAmount)
  }

  const incrementValues =
    quickButtonValues === 'large'
      ? [100, 500]
      : quickButtonValues ?? (hasLotsOfMana ? [10, 50, 250] : [1, 10])

  const isAdvancedTrader = useIsAdvancedTrader()

  return (
    <>
      <Col className={clsx('w-full max-w-[350px] gap-2', parentClassName)}>
        <Row className=" space-x-1">
          {!isAdvancedTrader && (
            <>
              <div className="text-ink-700 mb-1 mr-2 mt-2 ">Amount</div>
              <ChoicesToggleGroup
                currentChoice={quickAmounts.includes(amount ?? 0) ? amount : undefined}
                choicesMap={quickAmounts.reduce<{ [key: number]: number }>(
                  (map, amount) => {
                    map[amount] = amount
                    return map
                  },
                  {}
                )}
                setChoice={(amount) => {
                  if (typeof amount === 'number') {
                    onChange(amount)
                  }
                }}
              />
            </>
          )}
        </Row>

        <AmountInput
          className={className}
          inputClassName={clsx(
            ' w-full',
            isAdvancedTrader ? '!h-[72px]' : '!h-[54px]',
            hasLotsOfMana ? 'pr-[182px]' : 'pr-[134px]',
            inputClassName
          )}
          amount={amount}
          onChangeAmount={onChange}
          label={ENV_CONFIG.moneyMoniker}
          error={!!error}
          disabled={disabled}
          inputRef={inputRef}
          quickAddMoreButton={
            <Row className="divide-ink-300 divide-x text-sm">
              {incrementValues.map((increment) => (
                <IncrementDecrementAmountButton
                  key={increment}
                  amount={increment}
                  incrementBy={incrementBy}
                />
              ))}
            </Row>
          }
        />
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
          <div className="text-scarlet-500 mt-4 flex-wrap text-sm">
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
