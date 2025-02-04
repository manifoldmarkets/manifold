import { XIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import {
  MANA_MIN_BET,
  PHONE_VERIFICATION_BONUS,
  SWEEPS_MIN_BET,
} from 'common/economy'
import { ENV_CONFIG } from 'common/envs/constants'
import { MarketTierType } from 'common/tier'
import { humanish, User } from 'common/user'
import {
  formatMoney,
  formatWithToken,
  InputTokenType,
} from 'common/util/format'
import { ReactNode, useEffect, useState } from 'react'
import { VerifyPhoneModal } from 'web/components/user/verify-phone-number-banner'
import { useIsAdvancedTrader } from 'web/hooks/use-is-advanced-trader'
import { useUser } from 'web/hooks/use-user'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { SpiceCoin } from 'web/public/custom-components/spiceCoin'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'
import { AddFundsModal } from '../add-funds-modal'
import { BetSlider } from '../bet/bet-slider'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Input } from './input'
import { sliderColors } from './slider'
import { useCurrentPortfolio } from 'web/hooks/use-portfolio-history'

export function AmountInput(
  props: {
    amount: number | undefined
    onChangeAmount: (newAmount: number | undefined) => void
    error?: boolean
    label?: any
    disabled?: boolean
    className?: string
    inputClassName?: string
    inputStyle?: React.CSSProperties
    // Needed to focus the amount input
    inputRef?: React.MutableRefObject<any>
    quickAddMoreButton?: ReactNode
    allowFloat?: boolean
    allowNegative?: boolean
    disableClearButton?: boolean
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
    inputStyle,
    inputRef,
    quickAddMoreButton,
    allowNegative,
    disableClearButton,
    ...rest
  } = props

  const [amountString, setAmountString] = useState(formatAmountString(amount))

  const allowFloat = !!props.allowFloat

  function formatAmountString(amount: number | undefined) {
    return amount?.toString() ?? ''
  }

  const parse = allowFloat ? parseFloat : parseInt

  const bannedChars = new RegExp(
    `[^\\d${allowFloat && '.'}${allowNegative && '-'}]`,
    'g'
  )

  useEffect(() => {
    if (amount !== parse(amountString))
      setAmountString(formatAmountString(amount))
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
    <Col className={clsx('relative', className)}>
      <label className="font-sm md:font-lg relative">
        {label && (
          <span className="text-ink-400 absolute top-1/2 my-auto ml-2 -translate-y-1/2">
            {label}
          </span>
        )}
        <Row>
          <Input
            {...rest}
            className={clsx(label && 'pl-9', ' !text-lg', inputClassName)}
            style={inputStyle}
            ref={inputRef}
            type={allowFloat ? 'number' : 'text'}
            inputMode={allowFloat ? 'decimal' : 'numeric'}
            placeholder="0"
            maxLength={9}
            step={0.01}
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
            min={allowFloat ? 0 : 1}
          />
          {quickAddMoreButton
            ? quickAddMoreButton
            : !disableClearButton &&
              amount !== undefined && (
                <button
                  className="text-ink-400 hover:text-ink-500 active:text-ink-500 absolute right-4 top-1/2 -translate-y-1/2"
                  onClick={() => onChangeAmount(undefined)}
                >
                  <XIcon className="h-4 w-4" />
                </button>
              )}
        </Row>
      </label>
    </Col>
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
  disableQuickButtons?: boolean
  token?: InputTokenType
  marketTier?: MarketTierType | undefined
  sliderColor?: keyof typeof sliderColors
}) {
  const {
    amount,
    onChange,
    error,
    setError,
    marketTier,
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
    disableQuickButtons,
    token = 'M$',
    sliderColor,
  } = props
  const user = useUser()
  const isAdvancedTrader = useIsAdvancedTrader()

  // Check for errors.
  useEffect(() => {
    if (
      !disregardUserBalance &&
      user &&
      ((token === 'M$' &&
        (user.balance < (amount ?? 0) || user.balance < MANA_MIN_BET)) ||
        (token === 'CASH' &&
          (user.cashBalance < (amount ?? 0) ||
            user.cashBalance < SWEEPS_MIN_BET)))
    ) {
      setError('Insufficient balance')
    } else if (amount !== undefined) {
      if (token === 'CASH' && amount < SWEEPS_MIN_BET) {
        setError(
          'Minimum amount: ' +
            formatWithToken({ amount: SWEEPS_MIN_BET, token: 'CASH' })
        )
      } else if (minimumAmount != undefined && amount < minimumAmount) {
        setError(
          'Minimum amount: ' +
            formatWithToken({ amount: minimumAmount, token: token })
        )
      } else if (maximumAmount != undefined && amount > maximumAmount) {
        setError(
          'Maximum amount: ' +
            formatWithToken({ amount: maximumAmount, token: token })
        )
      } else {
        setError(undefined)
      }
    } else {
      setError(undefined)
    }
  }, [amount, user, minimumAmount, maximumAmount, disregardUserBalance, token])

  const portfolio = useCurrentPortfolio(user?.id)
  const hasLotsOfMoney =
    token === 'CASH'
      ? !!portfolio &&
        portfolio.cashBalance + portfolio.cashInvestmentValue > 10000
      : !!portfolio && portfolio.balance + portfolio.investmentValue > 10000

  const amountWithDefault = amount ?? 0

  const incrementBy = (increment: number) => {
    const newAmount = amountWithDefault + increment
    if (newAmount <= 0) onChange(undefined)
    else if (amountWithDefault < increment) onChange(increment)
    else onChange(newAmount)
  }

  const advancedIncrementValues = (
    hasLotsOfMoney ? [50, 250, 1000] : [10, 50, 100]
  ).map((v) => (marketTier === 'play' ? v / 10 : v))
  const defaultIncrementValues = (
    hasLotsOfMoney ? [50, 250, 1000] : [10, 50, 100]
  ).map((v) => (marketTier === 'play' ? v / 10 : v))

  const incrementValues =
    quickButtonValues === 'large'
      ? [500, 1000, 5000]
      : quickButtonValues ??
        (isAdvancedTrader ? advancedIncrementValues : defaultIncrementValues)

  return (
    <>
      <Col className={clsx('w-full max-w-[350px]', parentClassName)}>
        <AmountInput
          className={className}
          inputClassName={clsx('w-full !text-xl h-[60px]', inputClassName)}
          label={
            token === 'SPICE' ? (
              <SpiceCoin />
            ) : token == 'CASH' ? (
              <SweepiesCoin />
            ) : (
              <ManaCoin />
            )
          }
          amount={amount}
          onChangeAmount={onChange}
          error={!!error}
          allowFloat={token === 'CASH'}
          disabled={disabled}
          inputRef={inputRef}
          disableClearButton={!isAdvancedTrader}
        />
        {showSlider && (
          <BetSlider
            amount={amount}
            onAmountChange={onChange}
            binaryOutcome={binaryOutcome}
            disabled={disabled}
            smallAmounts={!hasLotsOfMoney || marketTier === 'play'}
            token={token}
            sliderColor={sliderColor}
          />
        )}
        {error ? (
          <div className="text-scarlet-500 mt-2 flex-wrap text-sm">
            {error === 'Insufficient balance' ? (
              <BuyMoreFunds user={user} />
            ) : (
              error
            )}
          </div>
        ) : (
          showBalance &&
          user && (
            <div className="text-ink-500 mt-4 whitespace-nowrap text-sm">
              Balance{' '}
              <span className="text-ink-800">
                {formatWithToken({ amount: user.balance, token: token })}
              </span>
            </div>
          )
        )}
      </Col>
    </>
  )
}

const BuyMoreFunds = (props: { user: User | null | undefined }) => {
  const { user } = props
  const [addFundsModalOpen, setAddFundsModalOpen] = useState(false)
  const [showVerifyPhone, setShowVerifyPhone] = useState(false)
  return (
    <>
      Not enough funds.
      <button
        className="text-primary-500 hover:decoration-primary-400 ml-1 hover:underline"
        onClick={() => setAddFundsModalOpen(true)}
      >
        Buy more?
      </button>
      {user && !humanish(user) && (
        <button
          className="text-primary-500 hover:decoration-primary-400 ml-1 hover:underline"
          onClick={() => setShowVerifyPhone(true)}
        >
          Verify your phone number for {formatMoney(PHONE_VERIFICATION_BONUS)}
        </button>
      )}
      <VerifyPhoneModal open={showVerifyPhone} setOpen={setShowVerifyPhone} />
      <AddFundsModal open={addFundsModalOpen} setOpen={setAddFundsModalOpen} />
    </>
  )
}
