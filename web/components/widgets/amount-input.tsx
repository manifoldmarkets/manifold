import clsx from 'clsx'
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
  hideQuickAdd?: boolean
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
    hideQuickAdd,
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

  const quickAmounts = [10, 25, 50, 100]

  return (
    <>
      <Col className={clsx('gap-2', parentClassName)}>
        <Row className={clsx('flex-wrap items-center gap-x-2 gap-y-1')}>
          <AmountInput
            className={className}
            inputClassName={clsx('!h-14 w-32', inputClassName)}
            amount={amount}
            onChangeAmount={onChange}
            label={ENV_CONFIG.moneyMoniker}
            error={!!error}
            disabled={disabled}
            inputRef={inputRef}
          />
          {!hideQuickAdd && (
            <Row className="gap-1">
              {quickAmounts.map((quickAmount) => (
                <QuickAmountButton
                  key={quickAmount}
                  amount={quickAmount}
                  selected={amount === quickAmount}
                  onClick={() => onChange(quickAmount)}
                />
              ))}
            </Row>
          )}
        </Row>

        {showSlider && (
          <BetSlider
            amount={amount}
            onAmountChange={onChange}
            binaryOutcome={binaryOutcome}
            disabled={disabled}
            smallManaAmounts={!hasLotsOfMana}
          />
        )}

        {error ? (
          <div className="text-scarlet-500 mt-0.5 whitespace-nowrap text-sm">
            {error === 'Insufficient balance' ? <BuyMoreFunds /> : error}
          </div>
        ) : (
          showBalance &&
          user && (
            <div className="text-ink-500 mt-2 whitespace-nowrap text-sm">
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

const QuickAmountButton = (props: {
  amount: number
  selected: boolean
  onClick: () => void
  className?: string
}) => {
  const { amount, selected, onClick, className } = props
  return (
    <button
      className={clsx(
        'bg-canvas-0 active:bg-ink-50 text-ink-500 hover:decoration-ink-400 border-ink-300 h-14 w-12 rounded border text-sm font-semibold shadow-sm hover:underline',
        selected && 'bg-ink-100',
        className
      )}
      onClick={onClick}
    >
      <div className="pointer-events-none">{formatMoney(amount)}</div>
    </button>
  )
}
