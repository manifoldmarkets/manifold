import clsx from 'clsx'
import React, { useEffect, useState } from 'react'
import { clamp } from 'lodash'
import toast from 'react-hot-toast'
import { CheckIcon } from '@heroicons/react/solid'

import { useUser } from 'web/hooks/use-user'
import {
  CPMMBinaryContract,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'
import {
  formatLargeNumber,
  formatMoney,
  formatOutcomeLabel,
  formatPercent,
} from 'common/util/format'
import { getBinaryBetStats, getBinaryCpmmBetInfo } from 'common/new-bet'
import { User } from 'web/lib/firebase/users'
import { LimitBet } from 'common/bet'
import { APIError, placeBet } from 'web/lib/firebase/api'
import { BuyAmountInput } from '../widgets/amount-input'
import {
  BinaryOutcomeLabel,
  HigherLabel,
  LowerLabel,
  NoLabel,
  YesLabel,
} from '../outcome-label'
import { getProbability } from 'common/calculate'
import { useFocus } from 'web/hooks/use-focus'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { getCpmmProbability } from 'common/calculate-cpmm'
import { getFormattedMappedValue, getMappedValue } from 'common/pseudo-numeric'
import { SellRow } from './sell-row'
import { useSaveBinaryShares } from '../../hooks/use-save-binary-shares'
import { BetSignUpPrompt } from '../sign-up-prompt'
import { ProbabilityOrNumericInput } from '../widgets/probability-input'
import { track } from 'web/lib/service/analytics'
import { useUnfilledBetsAndBalanceByUserId } from 'web/hooks/use-bets'
import { YourOrders, OrderBookButton } from './limit-bets'
import { PillButton } from '../buttons/pill-button'
import { YesNoSelector } from './yes-no-selector'
import { isAndroid, isIOS } from 'web/lib/util/device'
import { WarningConfirmationButton } from '../buttons/warning-confirmation-button'
import { Button } from '../buttons/button'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { SINGULAR_BET } from 'common/user'
import { SiteLink } from '../widgets/site-link'
import { ExternalLinkIcon } from '@heroicons/react/outline'
import { STONK_NO, STONK_YES } from 'common/stonk'

export function BetPanel(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  className?: string
}) {
  const { contract, className } = props
  const user = useUser()
  const userBets = useUserContractBets(user?.id, contract.id)
  const { unfilledBets, balanceByUserId } = useUnfilledBetsAndBalanceByUserId(
    contract.id
  )
  const { sharesOutcome } = useSaveBinaryShares(contract, userBets)

  const [isLimitOrder, setIsLimitOrder] = useState(false)

  if (!user) return <></>

  return (
    <Col className={className}>
      <SellRow
        contract={contract}
        user={user}
        className={'bg-ink-100 rounded-t-md px-4 py-5'}
      />
      <Col
        className={clsx(
          'bg-canvas-0 relative rounded-b-md px-6 py-6',
          !sharesOutcome && 'rounded-t-md',
          className
        )}
      >
        <QuickOrLimitBet
          isLimitOrder={isLimitOrder}
          setIsLimitOrder={setIsLimitOrder}
          hideToggle={!user}
        />
        <BuyPanel
          hidden={isLimitOrder}
          contract={contract}
          user={user}
          unfilledBets={unfilledBets}
          balanceByUserId={balanceByUserId}
        />
        <LimitOrderPanel
          hidden={!isLimitOrder}
          contract={contract}
          user={user}
          unfilledBets={unfilledBets}
          balanceByUserId={balanceByUserId}
        />
      </Col>

      {unfilledBets.length > 0 && (
        <YourOrders className="mt-4" contract={contract} bets={unfilledBets} />
      )}
    </Col>
  )
}

export function SimpleBetPanel(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  className?: string
  hasShares?: boolean
  onBetSuccess?: () => void
}) {
  const { contract, className, hasShares, onBetSuccess } = props

  const user = useUser()
  const [isLimitOrder, setIsLimitOrder] = useState(false)

  const { unfilledBets, balanceByUserId } = useUnfilledBetsAndBalanceByUserId(
    contract.id
  )

  return (
    <Col className={className}>
      <SellRow
        contract={contract}
        user={user}
        className={'bg-ink-100 rounded-t-md px-4 py-5'}
      />
      <Col
        className={clsx(
          !hasShares && 'rounded-t-md',
          'bg-canvas-0 rounded-b-md px-8 py-6'
        )}
      >
        <QuickOrLimitBet
          isLimitOrder={isLimitOrder}
          setIsLimitOrder={setIsLimitOrder}
          hideToggle={!user}
        />
        <BuyPanel
          hidden={isLimitOrder}
          contract={contract}
          user={user}
          unfilledBets={unfilledBets}
          balanceByUserId={balanceByUserId}
          onBuySuccess={onBetSuccess}
        />
        <LimitOrderPanel
          hidden={!isLimitOrder}
          contract={contract}
          user={user}
          unfilledBets={unfilledBets}
          balanceByUserId={balanceByUserId}
          onBuySuccess={onBetSuccess}
        />

        <BetSignUpPrompt />
      </Col>

      {unfilledBets.length > 0 && (
        <YourOrders className="mt-4" contract={contract} bets={unfilledBets} />
      )}
    </Col>
  )
}

export type binaryOutcomes = 'YES' | 'NO' | undefined

export function BuyPanel(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  user: User | null | undefined
  unfilledBets: LimitBet[]
  balanceByUserId: { [userId: string]: number }
  hidden: boolean
  onBuySuccess?: () => void
  mobileView?: boolean
  initialOutcome?: binaryOutcomes
  location?: string
  className?: string
}) {
  const {
    contract,
    user,
    unfilledBets,
    balanceByUserId,
    hidden,
    onBuySuccess,
    mobileView,
    initialOutcome,
    location = 'bet panel',
    className,
  } = props

  const initialProb = getProbability(contract)
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'
  const [option, setOption] = useState<binaryOutcomes | 'LIMIT'>(initialOutcome)

  const outcome = option === 'LIMIT' ? undefined : option
  const seeLimit = option === 'LIMIT'

  const [betAmount, setBetAmount] = useState<number | undefined>(10)
  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [inputRef, focusAmountInput] = useFocus()

  useEffect(() => {
    if (initialOutcome) {
      setOption(initialOutcome)
    }
  }, [initialOutcome])

  function onOptionChoice(choice: 'YES' | 'NO' | 'LIMIT') {
    if (option === choice) {
      setOption(undefined)
    } else {
      setOption(choice)
    }

    if (!isIOS() && !isAndroid()) {
      focusAmountInput()
    }
  }

  function onBetChange(newAmount: number | undefined) {
    setBetAmount(newAmount)
    if (!outcome) {
      setOption('YES')
    }
  }

  async function submitBet() {
    if (!user || !betAmount) return

    setError(undefined)
    setIsSubmitting(true)

    placeBet({
      outcome,
      amount: betAmount,
      contractId: contract.id,
    })
      .then((r) => {
        console.log('placed bet. Result:', r)
        setIsSubmitting(false)
        setBetAmount(undefined)
        if (onBuySuccess) onBuySuccess()
        else {
          toast('Trade submitted!', {
            icon: <CheckIcon className={'h-5 w-5 text-teal-500'} />,
          })
        }
      })
      .catch((e) => {
        if (e instanceof APIError) {
          setError(e.toString())
        } else {
          console.error(e)
          setError('Error placing bet')
        }
        setIsSubmitting(false)
      })

    track('bet', {
      location,
      outcomeType: contract.outcomeType,
      slug: contract.slug,
      contractId: contract.id,
      amount: betAmount,
      outcome,
      isLimitOrder: false,
    })
  }

  const betDisabled =
    isSubmitting || !betAmount || !!error || outcome === undefined

  const { newPool, newP, newBet } = getBinaryCpmmBetInfo(
    outcome ?? 'YES',
    betAmount ?? 0,
    contract,
    undefined,
    unfilledBets,
    balanceByUserId
  )

  const resultProb = getCpmmProbability(newPool, newP)
  const probStayedSame =
    formatPercent(resultProb) === formatPercent(initialProb)

  const probChange = Math.abs(resultProb - initialProb)
  const currentPayout = newBet.shares
  const currentReturn = betAmount ? (currentPayout - betAmount) / betAmount : 0
  const currentReturnPercent = formatPercent(currentReturn)

  const rawDifference = Math.abs(
    getMappedValue(contract, resultProb) - getMappedValue(contract, initialProb)
  )
  const displayedDifference = isPseudoNumeric
    ? formatLargeNumber(rawDifference)
    : formatPercent(rawDifference)

  const bankrollFraction = (betAmount ?? 0) / (user?.balance ?? 1e9)

  const warning =
    (betAmount ?? 0) >= 100 && bankrollFraction >= 0.5 && bankrollFraction <= 1
      ? `You might not want to spend ${formatPercent(
          bankrollFraction
        )} of your balance on a single trade. \n\nCurrent balance: ${formatMoney(
          user?.balance ?? 0
        )}`
      : (betAmount ?? 0) > 10 && probChange > 0.299 && bankrollFraction <= 1
      ? `Are you sure you want to move the market by ${displayedDifference}?`
      : undefined

  const displayError = !!outcome

  return (
    <Col className={clsx(className, hidden ? 'hidden' : '')}>
      <Row className="mb-2 w-full items-center gap-3">
        <YesNoSelector
          className="flex-1"
          btnClassName="flex-1"
          selected={outcome}
          onSelect={(choice) => {
            onOptionChoice(choice)
          }}
          yesLabel={isPseudoNumeric ? 'HIGHER' : undefined}
          noLabel={isPseudoNumeric ? 'LOWER' : undefined}
        />
        <button
          className={clsx(
            'inline-flex items-center justify-center rounded-3xl border-2 p-2',
            seeLimit
              ? 'border-indigo-500 bg-indigo-500 text-white'
              : 'bg-canvas-0 border-indigo-500 text-indigo-500 hover:border-indigo-500 hover:bg-indigo-500/10 hover:text-indigo-500'
          )}
          onClick={() => onOptionChoice('LIMIT')}
        >
          <div className="h-6 w-6 text-center">%</div>
        </button>
      </Row>

      <Col
        className={clsx(
          outcome === 'NO'
            ? 'bg-red-500/10'
            : outcome === 'YES'
            ? 'bg-teal-500/10'
            : 'hidden',
          'rounded-lg px-4 py-2'
        )}
      >
        <Row className="text-ink-500 mt-2 mb-1 items-center justify-between text-left text-sm">
          Amount
        </Row>

        <BuyAmountInput
          inputClassName="w-full max-w-none"
          amount={betAmount}
          onChange={onBetChange}
          error={displayError ? error : undefined}
          setError={setError}
          disabled={isSubmitting}
          inputRef={inputRef}
          sliderOptions={{ show: true, wrap: false }}
          binaryOutcome={outcome}
          showBalance
        />

        <Row className="mt-8 w-full">
          <Col className="w-1/2 text-sm">
            <Col className="text-ink-500 flex-nowrap whitespace-nowrap text-sm">
              <div>
                {isPseudoNumeric ? 'Shares' : <>Payout if {outcome ?? 'YES'}</>}
              </div>
            </Col>
            <div>
              <span className="whitespace-nowrap text-lg">
                {formatMoney(currentPayout)}
              </span>
              <span className="text-ink-500 pr-3 text-sm">
                {' '}
                +{currentReturnPercent}
              </span>
            </div>
          </Col>
          <Col className="w-1/2 text-sm">
            <Row>
              <span className="text-ink-500 whitespace-nowrap text-sm">
                {isPseudoNumeric ? 'Estimated value' : 'New probability'}
              </span>
              {!isPseudoNumeric && (
                <InfoTooltip
                  text={`The probability of YES after your ${SINGULAR_BET}`}
                  className="ml-1"
                />
              )}
            </Row>
            {probStayedSame ? (
              <div className="text-lg">
                {getFormattedMappedValue(contract, initialProb)}
              </div>
            ) : (
              <div className="text-lg">
                {getFormattedMappedValue(contract, resultProb)}
                <span className={clsx('text-ink-500 text-sm')}>
                  {isPseudoNumeric ? (
                    <></>
                  ) : (
                    <>
                      {' '}
                      {outcome != 'NO' && '+'}
                      {getFormattedMappedValue(
                        contract,
                        resultProb - initialProb
                      )}
                    </>
                  )}
                </span>
              </div>
            )}
          </Col>
        </Row>

        <Spacer h={8} />
        {user && (
          <WarningConfirmationButton
            marketType="binary"
            amount={betAmount}
            warning={warning}
            onSubmit={submitBet}
            isSubmitting={isSubmitting}
            disabled={betDisabled}
            size="xl"
            color={outcome === 'NO' ? 'red' : 'green'}
            actionLabel={
              betDisabled
                ? `Select ${formatOutcomeLabel(
                    contract,
                    'YES'
                  )} or ${formatOutcomeLabel(contract, 'NO')}`
                : 'Wager'
            }
          />
        )}
      </Col>

      {option === 'LIMIT' && (
        <>
          <LimitOrderPanel
            className="rounded-lg bg-indigo-400/10 px-4 py-2"
            hidden={!seeLimit}
            contract={contract}
            user={user}
            unfilledBets={unfilledBets}
            balanceByUserId={balanceByUserId}
            mobileView={mobileView}
          />

          <YourOrders
            className="mt-2 rounded-lg bg-indigo-400/10 px-4 py-2"
            contract={contract}
            bets={unfilledBets as LimitBet[]}
          />
        </>
      )}
    </Col>
  )
}
export function BuyStonkPanel(props: {
  contract: StonkContract
  user: User | null | undefined
  unfilledBets: LimitBet[]
  balanceByUserId: { [userId: string]: number }
  hidden: boolean
  onBuySuccess?: () => void
  mobileView?: boolean
  initialOutcome?: binaryOutcomes
  location?: string
  className?: string
}) {
  const {
    contract,
    user,
    unfilledBets,
    balanceByUserId,
    hidden,
    onBuySuccess,
    mobileView,
    initialOutcome,
    location = 'bet panel',
    className,
  } = props

  const initialProb = getProbability(contract)
  const [option, setOption] = useState<binaryOutcomes>(initialOutcome)
  const outcome = option

  const [betAmount, setBetAmount] = useState<number | undefined>(10)
  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [inputRef, focusAmountInput] = useFocus()

  useEffect(() => {
    if (initialOutcome) {
      setOption(initialOutcome)
    }
  }, [initialOutcome])

  function onOptionChoice(choice: 'YES' | 'NO') {
    if (option === choice) {
      setOption(undefined)
    } else {
      setOption(choice)
    }

    if (!isIOS() && !isAndroid()) {
      focusAmountInput()
    }
  }

  function onBetChange(newAmount: number | undefined) {
    setBetAmount(newAmount)
    if (!outcome) {
      setOption('YES')
    }
  }

  async function submitBet() {
    if (!user || !betAmount) return

    setError(undefined)
    setIsSubmitting(true)

    placeBet({
      outcome,
      amount: betAmount,
      contractId: contract.id,
    })
      .then((r) => {
        console.log('placed bet. Result:', r)
        setIsSubmitting(false)
        setBetAmount(undefined)
        if (onBuySuccess) onBuySuccess()
        else {
          toast('Trade submitted!', {
            icon: <CheckIcon className={'h-5 w-5 text-teal-500'} />,
          })
        }
      })
      .catch((e) => {
        if (e instanceof APIError) {
          setError(e.toString())
        } else {
          console.error(e)
          setError('Error placing bet')
        }
        setIsSubmitting(false)
      })

    track('bet', {
      location,
      outcomeType: contract.outcomeType,
      slug: contract.slug,
      contractId: contract.id,
      amount: betAmount,
      outcome,
      isLimitOrder: false,
    })
  }

  const betDisabled =
    isSubmitting || !betAmount || !!error || outcome === undefined

  const { newPool, newP, newBet } = getBinaryCpmmBetInfo(
    outcome ?? 'YES',
    betAmount ?? 0,
    contract,
    undefined,
    unfilledBets,
    balanceByUserId
  )

  const resultProb = getCpmmProbability(newPool, newP)
  const probStayedSame =
    formatPercent(resultProb) === formatPercent(initialProb)

  const probChange = Math.abs(resultProb - initialProb)
  const currentPayout = newBet.shares
  const currentReturn = betAmount ? (currentPayout - betAmount) / betAmount : 0
  const currentReturnPercent = formatPercent(currentReturn)

  const rawDifference = Math.abs(
    getMappedValue(contract, resultProb) - getMappedValue(contract, initialProb)
  )
  const displayedDifference = formatLargeNumber(rawDifference)

  const bankrollFraction = (betAmount ?? 0) / (user?.balance ?? 1e9)

  const warning =
    (betAmount ?? 0) >= 100 && bankrollFraction >= 0.5 && bankrollFraction <= 1
      ? `You might not want to spend ${formatPercent(
          bankrollFraction
        )} of your balance on a single trade. \n\nCurrent balance: ${formatMoney(
          user?.balance ?? 0
        )}`
      : (betAmount ?? 0) > 10 && probChange > 0.299 && bankrollFraction <= 1
      ? `Are you sure you want to move the market by ${displayedDifference}?`
      : undefined

  const displayError = !!outcome

  return (
    <Col className={clsx(className, hidden ? 'hidden' : '')}>
      <Row className="mb-2 w-full items-center gap-3">
        <YesNoSelector
          className="flex-1"
          btnClassName="flex-1"
          selected={outcome}
          onSelect={(choice) => {
            onOptionChoice(choice)
          }}
          yesLabel={STONK_YES}
          noLabel={STONK_NO}
        />
      </Row>

      <Col
        className={clsx(
          outcome === 'NO'
            ? 'bg-red-500/10'
            : outcome === 'YES'
            ? 'bg-teal-500/10'
            : 'hidden',
          'rounded-lg px-4 py-2'
        )}
      >
        <Row className="text-ink-500 mt-2 mb-1 items-center justify-between text-left text-sm">
          Amount
        </Row>

        <BuyAmountInput
          inputClassName="w-full max-w-none"
          amount={betAmount}
          onChange={onBetChange}
          error={displayError ? error : undefined}
          setError={setError}
          disabled={isSubmitting}
          inputRef={inputRef}
          sliderOptions={{ show: true, wrap: false }}
          binaryOutcome={outcome}
          showBalance
        />

        <Row className="mt-8 w-full">
          <Col className="w-1/2 text-sm">
            <Col className="text-ink-500 flex-nowrap whitespace-nowrap text-sm">
              <div>{'Shares'}</div>
            </Col>
            <div>
              <span className="whitespace-nowrap text-lg">{currentPayout}</span>
            </div>
          </Col>
          <Col className="w-1/2 text-sm">
            <Row>
              <span className="text-ink-500 whitespace-nowrap text-sm">
                {'New stonk price'}
              </span>
            </Row>
            {probStayedSame ? (
              <div className="text-lg">
                {getFormattedMappedValue(contract, initialProb)}
              </div>
            ) : (
              <div className="text-lg">
                {getFormattedMappedValue(contract, resultProb)}
              </div>
            )}
          </Col>
        </Row>

        <Spacer h={8} />
        {user && (
          <WarningConfirmationButton
            marketType="binary"
            amount={betAmount}
            warning={warning}
            onSubmit={submitBet}
            isSubmitting={isSubmitting}
            disabled={betDisabled}
            size="xl"
            color={outcome === 'NO' ? 'red' : 'green'}
            actionLabel={
              betDisabled
                ? `Select ${formatOutcomeLabel(
                    contract,
                    'YES'
                  )} or ${formatOutcomeLabel(contract, 'NO')}`
                : 'Wager'
            }
          />
        )}
      </Col>
    </Col>
  )
}

function LimitOrderPanel(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  user: User | null | undefined
  unfilledBets: LimitBet[]
  balanceByUserId: { [userId: string]: number }
  hidden: boolean
  onBuySuccess?: () => void
  mobileView?: boolean
  className?: string
}) {
  const {
    contract,
    user,
    unfilledBets,
    balanceByUserId,
    hidden,
    onBuySuccess,
    mobileView,
    className,
  } = props

  const initialProb = getProbability(contract)
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'

  const [betAmount, setBetAmount] = useState<number | undefined>(undefined)
  const [lowLimitProb, setLowLimitProb] = useState<number | undefined>()
  const [highLimitProb, setHighLimitProb] = useState<number | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const rangeError =
    lowLimitProb !== undefined &&
    highLimitProb !== undefined &&
    lowLimitProb >= highLimitProb

  const outOfRangeError =
    (lowLimitProb !== undefined &&
      (lowLimitProb <= 0 || lowLimitProb >= 100)) ||
    (highLimitProb !== undefined &&
      (highLimitProb <= 0 || highLimitProb >= 100))

  const hasYesLimitBet = lowLimitProb !== undefined && !!betAmount
  const hasNoLimitBet = highLimitProb !== undefined && !!betAmount
  const hasTwoBets = hasYesLimitBet && hasNoLimitBet

  const betDisabled =
    isSubmitting ||
    !betAmount ||
    rangeError ||
    outOfRangeError ||
    !!error ||
    (!hasYesLimitBet && !hasNoLimitBet)

  const yesLimitProb =
    lowLimitProb === undefined
      ? undefined
      : clamp(lowLimitProb / 100, 0.001, 0.999)
  const noLimitProb =
    highLimitProb === undefined
      ? undefined
      : clamp(highLimitProb / 100, 0.001, 0.999)

  const amount = betAmount ?? 0
  const shares =
    yesLimitProb !== undefined && noLimitProb !== undefined
      ? Math.min(amount / yesLimitProb, amount / (1 - noLimitProb))
      : yesLimitProb !== undefined
      ? amount / yesLimitProb
      : noLimitProb !== undefined
      ? amount / (1 - noLimitProb)
      : 0

  const yesAmount = shares * (yesLimitProb ?? 1)
  const noAmount = shares * (1 - (noLimitProb ?? 0))

  function onBetChange(newAmount: number | undefined) {
    setBetAmount(newAmount)
  }

  async function submitBet() {
    if (!user || betDisabled) return

    setError(undefined)
    setIsSubmitting(true)

    const betsPromise = hasTwoBets
      ? Promise.all([
          placeBet({
            outcome: 'YES',
            amount: yesAmount,
            limitProb: yesLimitProb,
            contractId: contract.id,
          }),
          placeBet({
            outcome: 'NO',
            amount: noAmount,
            limitProb: noLimitProb,
            contractId: contract.id,
          }),
        ])
      : placeBet({
          outcome: hasYesLimitBet ? 'YES' : 'NO',
          amount: betAmount,
          contractId: contract.id,
          limitProb: hasYesLimitBet ? yesLimitProb : noLimitProb,
        })

    betsPromise
      .catch((e) => {
        if (e instanceof APIError) {
          setError(e.toString())
        } else {
          console.error(e)
          setError('Error placing bet')
        }
        setIsSubmitting(false)
      })
      .then((r) => {
        console.log('placed bet. Result:', r)
        setIsSubmitting(false)
        setBetAmount(undefined)
        setLowLimitProb(undefined)
        setHighLimitProb(undefined)
        if (onBuySuccess) onBuySuccess()
      })

    if (hasYesLimitBet) {
      track('bet', {
        location: 'bet panel',
        outcomeType: contract.outcomeType,
        slug: contract.slug,
        contractId: contract.id,
        amount: yesAmount,
        outcome: 'YES',
        limitProb: yesLimitProb,
        isLimitOrder: true,
        isRangeOrder: hasTwoBets,
      })
    }
    if (hasNoLimitBet) {
      track('bet', {
        location: 'bet panel',
        outcomeType: contract.outcomeType,
        slug: contract.slug,
        contractId: contract.id,
        amount: noAmount,
        outcome: 'NO',
        limitProb: noLimitProb,
        isLimitOrder: true,
        isRangeOrder: hasTwoBets,
      })
    }
  }

  const {
    currentPayout: yesPayout,
    currentReturn: yesReturn,
    totalFees: yesFees,
    newBet: yesBet,
  } = getBinaryBetStats(
    'YES',
    yesAmount,
    contract,
    yesLimitProb ?? initialProb,
    unfilledBets,
    balanceByUserId
  )
  const yesReturnPercent = formatPercent(yesReturn)

  const {
    currentPayout: noPayout,
    currentReturn: noReturn,
    totalFees: noFees,
    newBet: noBet,
  } = getBinaryBetStats(
    'NO',
    noAmount,
    contract,
    noLimitProb ?? initialProb,
    unfilledBets,
    balanceByUserId
  )
  const noReturnPercent = formatPercent(noReturn)

  const profitIfBothFilled = shares - (yesAmount + noAmount) - yesFees - noFees

  return (
    <Col className={clsx(className, hidden && 'hidden')}>
      <Row
        className={clsx(
          'mb-2 w-full justify-between gap-4 self-start',
          mobileView ? '' : 'sm:hidden'
        )}
      >
        <OrderBookButton limitBets={unfilledBets} contract={contract} />
        <SiteLink
          className="text-ink-500 flex flex-row items-center gap-1 text-sm"
          href={
            // Manifold help for limit orders.
            'https://help.manifold.markets/64cf65f9f96047c3a727489e778e5983'
          }
          followsLinkClass
        >
          What is a limit order? <ExternalLinkIcon className="h-4 w-4" />
        </SiteLink>
      </Row>
      <Row className="mt-1 mb-4 gap-4">
        <Col className="gap-2">
          <div className="text-ink-500 text-sm">
            Buy {isPseudoNumeric ? <HigherLabel /> : <YesLabel />} up to
          </div>
          <ProbabilityOrNumericInput
            contract={contract}
            prob={lowLimitProb}
            setProb={setLowLimitProb}
            isSubmitting={isSubmitting}
            placeholder="10"
          />
        </Col>

        <Col className="gap-2">
          <div className="text-ink-500 text-sm">
            Buy {isPseudoNumeric ? <LowerLabel /> : <NoLabel />} down to
          </div>
          <ProbabilityOrNumericInput
            contract={contract}
            prob={highLimitProb}
            setProb={setHighLimitProb}
            isSubmitting={isSubmitting}
            placeholder="90"
          />
        </Col>
        <Row
          className={clsx(
            mobileView ? 'hidden' : 'hidden sm:flex',
            'ml-auto gap-4 self-start'
          )}
        >
          <SiteLink
            className="text-ink-500 flex flex-row items-center gap-1 text-sm"
            href={
              // Manifold help for limit orders.
              'https://help.manifold.markets/64cf65f9f96047c3a727489e778e5983'
            }
            followsLinkClass
          >
            What is a limit order? <ExternalLinkIcon className="h-4 w-4" />
          </SiteLink>
          <OrderBookButton limitBets={unfilledBets} contract={contract} />
        </Row>
      </Row>

      {outOfRangeError && (
        <div className="text-scarlet-500 mb-2 mr-auto self-center whitespace-nowrap text-xs font-medium tracking-wide">
          Limit is out of range
        </div>
      )}
      {rangeError && !outOfRangeError && (
        <div className="text-scarlet-500 mb-2 mr-auto self-center whitespace-nowrap text-xs font-medium tracking-wide">
          {isPseudoNumeric ? 'HIGHER' : 'YES'} limit must be less than{' '}
          {isPseudoNumeric ? 'LOWER' : 'NO'} limit
        </div>
      )}

      <Row className="text-ink-500 mt-1 mb-3 justify-between text-left text-sm">
        <span>
          Max amount<span className="text-scarlet-500 ml-1">*</span>
        </span>
      </Row>

      <BuyAmountInput
        inputClassName="w-full max-w-none"
        amount={betAmount}
        onChange={onBetChange}
        error={error}
        setError={setError}
        disabled={isSubmitting}
        sliderOptions={{ show: true, wrap: false }}
        showBalance
      />

      <Col className="mt-8 w-full gap-3">
        {(hasTwoBets || (hasYesLimitBet && yesBet.amount !== 0)) && (
          <Row className="items-center justify-between gap-2 text-sm">
            <div className="text-ink-500 whitespace-nowrap">
              {isPseudoNumeric ? (
                <HigherLabel />
              ) : (
                <BinaryOutcomeLabel outcome={'YES'} />
              )}{' '}
              filled now
            </div>
            <div className="mr-2 whitespace-nowrap">
              {formatMoney(yesBet.amount)} of{' '}
              {formatMoney(yesBet.orderAmount ?? 0)}
            </div>
          </Row>
        )}
        {(hasTwoBets || (hasNoLimitBet && noBet.amount !== 0)) && (
          <Row className="items-center justify-between gap-2 text-sm">
            <div className="text-ink-500 whitespace-nowrap">
              {isPseudoNumeric ? (
                <LowerLabel />
              ) : (
                <BinaryOutcomeLabel outcome={'NO'} />
              )}{' '}
              filled now
            </div>
            <div className="mr-2 whitespace-nowrap">
              {formatMoney(noBet.amount)} of{' '}
              {formatMoney(noBet.orderAmount ?? 0)}
            </div>
          </Row>
        )}
        {hasTwoBets && (
          <Row className="items-center justify-between gap-2 text-sm">
            <div className="text-ink-500 whitespace-nowrap">
              Profit if both orders filled
            </div>
            <div className="mr-2 whitespace-nowrap">
              {formatMoney(profitIfBothFilled)}
            </div>
          </Row>
        )}
        {hasYesLimitBet && !hasTwoBets && (
          <Row className="items-center justify-between gap-2 text-sm">
            <Row className="text-ink-500 flex-nowrap items-center gap-2 whitespace-nowrap">
              <div>
                {isPseudoNumeric ? (
                  'Shares'
                ) : (
                  <>
                    Max <BinaryOutcomeLabel outcome={'YES'} /> payout
                  </>
                )}
              </div>
              {/* <InfoTooltip
                text={`Includes ${formatMoneyWithDecimals(yesFees)} in fees`}
              /> */}
            </Row>
            <div>
              <span className="mr-2 whitespace-nowrap">
                {formatMoney(yesPayout)}
              </span>
              (+{yesReturnPercent})
            </div>
          </Row>
        )}
        {hasNoLimitBet && !hasTwoBets && (
          <Row className="items-center justify-between gap-2 text-sm">
            <Row className="text-ink-500 flex-nowrap items-center gap-2 whitespace-nowrap">
              <div>
                {isPseudoNumeric ? (
                  'Shares'
                ) : (
                  <>
                    Max <BinaryOutcomeLabel outcome={'NO'} /> payout
                  </>
                )}
              </div>
              {/* <InfoTooltip
                text={`Includes ${formatMoneyWithDecimals(noFees)} in fees`}
              /> */}
            </Row>
            <div>
              <span className="mr-2 whitespace-nowrap">
                {formatMoney(noPayout)}
              </span>
              (+{noReturnPercent})
            </div>
          </Row>
        )}
      </Col>

      {(hasYesLimitBet || hasNoLimitBet) && <Spacer h={8} />}

      {user && (
        <Button
          size="xl"
          disabled={betDisabled}
          color={'indigo'}
          loading={isSubmitting}
          className="flex-1"
          onClick={submitBet}
        >
          {isSubmitting
            ? 'Submitting...'
            : `Submit order${hasTwoBets ? 's' : ''}`}
        </Button>
      )}
    </Col>
  )
}

function QuickOrLimitBet(props: {
  isLimitOrder: boolean
  setIsLimitOrder: (isLimitOrder: boolean) => void
  hideToggle?: boolean
}) {
  const { isLimitOrder, setIsLimitOrder, hideToggle } = props

  return (
    <Row className="align-center mb-4 justify-between">
      <div className="mr-2 -ml-2 shrink-0 text-3xl sm:-ml-0">Trade</div>
      {!hideToggle && (
        <Row className="mt-1 ml-1 items-center gap-1.5 sm:ml-0 sm:gap-2">
          <PillButton
            selected={!isLimitOrder}
            onSelect={() => {
              setIsLimitOrder(false)
              track('select quick order')
            }}
            xs={true}
          >
            Quick
          </PillButton>
          <PillButton
            selected={isLimitOrder}
            onSelect={() => {
              setIsLimitOrder(true)
              track('select limit order')
            }}
            xs={true}
          >
            Limit
          </PillButton>
        </Row>
      )}
    </Row>
  )
}
