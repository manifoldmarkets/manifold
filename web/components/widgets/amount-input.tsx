import clsx from 'clsx'
import { ENV_CONFIG } from 'common/envs/constants'
import { formatMoney } from 'common/util/format'
import { ReactNode, useEffect, useState } from 'react'
import { BetSlider } from 'web/components/bet/bet-slider'
import { useUser } from 'web/hooks/use-user'
import { AddFundsModal } from '../add-funds-modal'
import { binaryOutcomes } from '../bet/bet-panel'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Input } from './input'

export function AmountInput(
  props: {
    amount: number | undefined
    onChangeAmount: (newAmount: number | undefined) => void
    error?: string
    label: string
    disabled?: boolean
    className?: string
    inputClassName?: string
    // Needed to focus the amount input
    inputRef?: React.MutableRefObject<any>
    quickAddMoreButton?: ReactNode
    allowFloat?: boolean
  } & JSX.IntrinsicElements['input']
) {
  const {
    amount,
    onChangeAmount,
    error,
    label,
    disabled,
    className,
    inputClassName,
    inputRef,
    quickAddMoreButton,
    allowFloat,
    ...rest
  } = props

  const parse = (str: string) =>
    !allowFloat
      ? parseInt(str.replace(/\D/g, ''))
      : parseFloat(str.replace(/[^0-9.]/g, ''))

  const onAmountChange = (str: string) => {
    const amount = parse(str)
    const isInvalid = !str || isNaN(amount)
    onChangeAmount(isInvalid ? undefined : amount)
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
              step={allowFloat ? 'any' : '1'}
              placeholder="0"
              maxLength={6}
              value={amount ?? ''}
              error={!!error}
              disabled={disabled}
              onChange={(e) => onAmountChange(e.target.value)}
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
  quickAddAmount?: number
  disabled?: boolean
  showBalance?: boolean
  parentClassName?: string
  className?: string
  inputClassName?: string
  // Needed to focus the amount input
  inputRef?: React.MutableRefObject<any>
  binaryOutcome?: binaryOutcomes
  sliderOptions?: {
    show: boolean
    wrap: boolean
  }
  customRange?: {
    rangeMin?: number
    rangeMax?: number
  }
  disregardUserBalance?: boolean
}) {
  const {
    amount,
    onChange,
    error,
    setError,
    sliderOptions,
    disabled,
    showBalance,
    parentClassName,
    className,
    inputClassName,
    minimumAmount,
    quickAddAmount = 10,
    inputRef,
    binaryOutcome,
    maximumAmount,
    customRange,
    disregardUserBalance,
  } = props
  const { show, wrap } = sliderOptions ?? {}

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
      <Col className={parentClassName}>
        <Row
          className={clsx(
            'items-center justify-between gap-x-4 gap-y-1 sm:justify-start',
            wrap ? 'flex-wrap' : ''
          )}
        >
          <AmountInput
            amount={amount}
            onChangeAmount={onChange}
            label={ENV_CONFIG.moneyMoniker}
            error={error}
            disabled={disabled}
            className={className}
            inputClassName={clsx('pr-12', inputClassName)}
            inputRef={inputRef}
            quickAddMoreButton={maximumAmount ? undefined : quickAddButton}
          />
          {show && (
            <BetSlider
              amount={amount}
              onAmountChange={onChange}
              binaryOutcome={binaryOutcome}
              maximumAmount={maximumAmount}
              customRange={customRange}
              disabled={disabled}
            />
          )}
        </Row>
        {error ? (
          <div className="text-scarlet-500 mt-0.5 whitespace-nowrap text-sm">
            {error === 'Insufficient balance' ? <BuyMoreFunds /> : error}
          </div>
        ) : (
          showBalance &&
          user && (
            <div className="text-ink-500 mt-0.5 whitespace-nowrap text-sm">
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
