import clsx from 'clsx'
import React, { useEffect, useState } from 'react'
import { clamp } from 'lodash'
import toast from 'react-hot-toast'
import { CheckIcon } from '@heroicons/react/solid'
import dayjs from 'dayjs'

import {
  CPMMBinaryContract,
  CPMMMultiContract,
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
import { computeCpmmBet } from 'common/new-bet'
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
import { useFocus } from 'web/hooks/use-focus'
import { useUnfilledBetsAndBalanceByUserId } from '../../hooks/use-bets'
import { getFormattedMappedValue, getMappedValue } from 'common/pseudo-numeric'
import { ProbabilityOrNumericInput } from '../widgets/probability-input'
import { track } from 'web/lib/service/analytics'
import { YourOrders, OrderBookButton } from './limit-bets'
import { YesNoSelector } from './yes-no-selector'
import { isAndroid, isIOS } from 'web/lib/util/device'
import { WarningConfirmationButton } from '../buttons/warning-confirmation-button'
import { Button } from '../buttons/button'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { SINGULAR_BET } from 'common/user'
import { getStonkShares, STONK_NO, STONK_YES } from 'common/stonk'
import { Input } from 'web/components/widgets/input'
import { DAY_MS, MINUTE_MS } from 'common/util/time'
import { Answer } from 'common/answer'
import { CpmmState, getCpmmProbability } from 'common/calculate-cpmm'
import { getProbability } from 'common/calculate'
import { removeUndefinedProps } from 'common/util/object'
import { calculateCpmmMultiArbitrageBet } from 'common/calculate-cpmm-arbitrage'

export type binaryOutcomes = 'YES' | 'NO' | undefined

export function BuyPanel(props: {
  contract:
    | CPMMBinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
  multiProps?: { answers: Answer[]; answerToBuy: Answer }
  user: User | null | undefined
  hidden: boolean
  onBuySuccess?: () => void
  mobileView?: boolean
  initialOutcome?: binaryOutcomes
  location?: string
  className?: string
}) {
  const {
    contract,
    multiProps,
    user,
    hidden,
    onBuySuccess,
    mobileView,
    initialOutcome,
    location = 'bet panel',
    className,
  } = props

  const isCpmmMulti = contract.mechanism === 'cpmm-multi-1'
  if (isCpmmMulti && !multiProps) {
    throw new Error('multiProps must be defined for cpmm-multi-1')
  }
  const shouldAnswersSumToOne =
    'shouldAnswersSumToOne' in contract ? contract.shouldAnswersSumToOne : false

  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'
  const isStonk = contract.outcomeType === 'STONK'
  const [option, setOption] = useState<binaryOutcomes | 'LIMIT'>(initialOutcome)
  const { unfilledBets, balanceByUserId } = useUnfilledBetsAndBalanceByUserId(
    contract.id,
    shouldAnswersSumToOne ? undefined : multiProps?.answerToBuy.id
  )
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
    if (option === choice && !initialOutcome) {
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
    placeBet(
      removeUndefinedProps({
        outcome,
        amount: betAmount,
        contractId: contract.id,
        answerId: multiProps?.answerToBuy.id,
      })
    )
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
      answerId: multiProps?.answerToBuy.id,
    })
  }

  const betDisabled =
    isSubmitting || !betAmount || !!error || outcome === undefined

  let currentPayout: number
  let probBefore: number
  let probAfter: number
  if (isCpmmMulti && multiProps && contract.shouldAnswersSumToOne) {
    const { answers, answerToBuy } = multiProps
    const { shares, newBetResult } = calculateCpmmMultiArbitrageBet(
      answers,
      answerToBuy,
      outcome ?? 'YES',
      betAmount ?? 0,
      undefined,
      unfilledBets,
      balanceByUserId
    )
    const { pool, p } = newBetResult.cpmmState
    currentPayout = shares
    probBefore = answerToBuy.prob
    probAfter = getCpmmProbability(pool, p)
  } else {
    const cpmmState = isCpmmMulti
      ? {
          pool: {
            YES: multiProps!.answerToBuy.poolYes,
            NO: multiProps!.answerToBuy.poolNo,
          },
          p: 0.5,
        }
      : { pool: contract.pool, p: contract.p }

    const result = computeCpmmBet(
      cpmmState,
      outcome ?? 'YES',
      betAmount ?? 0,
      undefined,
      unfilledBets,
      balanceByUserId
    )
    currentPayout = result.shares
    probBefore = result.probBefore
    probAfter = result.probAfter
  }

  const probStayedSame = formatPercent(probAfter) === formatPercent(probBefore)
  const probChange = Math.abs(probAfter - probBefore)
  const currentReturn = betAmount ? (currentPayout - betAmount) / betAmount : 0
  const currentReturnPercent = formatPercent(currentReturn)

  const rawDifference = Math.abs(
    getMappedValue(contract, probAfter) - getMappedValue(contract, probBefore)
  )
  const displayedDifference = isPseudoNumeric
    ? formatLargeNumber(rawDifference)
    : formatPercent(rawDifference)

  const bankrollFraction = (betAmount ?? 0) / (user?.balance ?? 1e9)

  // warnings
  const highBankrollSpend =
    (betAmount ?? 0) >= 100 && bankrollFraction >= 0.5 && bankrollFraction <= 1
  const highProbMove =
    (betAmount ?? 0) > 10 && probChange > 0.299 && bankrollFraction <= 1

  const warning = highBankrollSpend
    ? `You might not want to spend ${formatPercent(
        bankrollFraction
      )} of your balance on a single trade. \n\nCurrent balance: ${formatMoney(
        user?.balance ?? 0
      )}`
    : highProbMove
    ? `Are you sure you want to move the market by ${displayedDifference}?`
    : undefined

  const displayError = !!outcome

  return (
    <Col className={clsx(className, hidden ? 'hidden' : '')}>
      <Row className="mb-2 w-full items-center gap-3">
        <YesNoSelector
          className="flex-1"
          btnClassName="flex-1"
          selected={seeLimit ? 'LIMIT' : outcome}
          onSelect={(choice) => {
            onOptionChoice(choice)
          }}
          yesLabel={
            isPseudoNumeric ? 'Bet HIGHER' : isStonk ? STONK_YES : 'Bet YES'
          }
          noLabel={
            isPseudoNumeric ? 'Bet LOWER' : isStonk ? STONK_NO : 'Bet NO'
          }
        />
        {!isStonk && (
          <Button
            color={seeLimit ? 'indigo' : 'indigo-outline'}
            onClick={() => onOptionChoice('LIMIT')}
            className="text-lg"
          >
            %
          </Button>
        )}
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
        <div className="text-ink-800 mt-2 mb-1 text-sm">Amount</div>

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
            <Col className="text-ink-800 flex-nowrap whitespace-nowrap text-sm">
              <div>
                {isPseudoNumeric || isStonk ? (
                  'Shares'
                ) : (
                  <>Payout if {outcome ?? 'YES'}</>
                )}
              </div>
            </Col>
            <div>
              <span className="whitespace-nowrap text-lg font-semibold">
                {isStonk
                  ? getStonkShares(contract, currentPayout, 2)
                  : isPseudoNumeric
                  ? Math.floor(currentPayout)
                  : formatMoney(currentPayout)}
              </span>
              <span className="text-ink-500 pr-3 text-sm">
                {isStonk || isPseudoNumeric ? '' : ' +' + currentReturnPercent}
              </span>
            </div>
          </Col>
          <Col className="w-1/2 text-sm">
            <Row>
              <span className="text-ink-800 whitespace-nowrap text-sm">
                {isPseudoNumeric
                  ? 'Estimated value'
                  : isStonk
                  ? 'New stock price'
                  : 'New probability'}
              </span>
              {!isPseudoNumeric && !isStonk && (
                <InfoTooltip
                  text={`The probability of YES after your ${SINGULAR_BET}`}
                  className="ml-1"
                />
              )}
            </Row>
            {probStayedSame ? (
              <div className="text-lg font-semibold">
                {getFormattedMappedValue(contract, probBefore)}
              </div>
            ) : (
              <div>
                <span className="text-lg font-semibold">
                  {getFormattedMappedValue(contract, probAfter)}
                </span>
                <span
                  className={clsx(
                    'text-sm',
                    highProbMove ? 'text-warning font-semibold' : 'text-ink-500'
                  )}
                >
                  {isPseudoNumeric ? (
                    <></>
                  ) : (
                    <>
                      {' '}
                      {outcome != 'NO' && '+'}
                      {getFormattedMappedValue(
                        contract,
                        probAfter - probBefore
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
            userOptedOutOfWarning={user.optOutBetWarnings}
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
                : 'Bet'
            }
          />
        )}
      </Col>

      {option === 'LIMIT' && (
        <>
          <LimitOrderPanel
            className="rounded-lg bg-indigo-400/10 px-4 py-2"
            contract={contract}
            multiProps={multiProps}
            hidden={!seeLimit}
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
      {/* Stonks don't allow limit orders but users may have them from before the conversion*/}
      {isStonk && unfilledBets.length > 0 && (
        <YourOrders
          className="mt-2 rounded-lg bg-indigo-400/10 px-4 py-2"
          contract={contract}
          bets={unfilledBets as LimitBet[]}
        />
      )}
    </Col>
  )
}

function LimitOrderPanel(props: {
  contract:
    | CPMMBinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
  multiProps?: { answers: Answer[]; answerToBuy: Answer }
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
    multiProps,
    user,
    unfilledBets,
    balanceByUserId,
    hidden,
    onBuySuccess,
    mobileView,
    className,
  } = props

  const isCpmmMulti = contract.mechanism === 'cpmm-multi-1'
  if (isCpmmMulti && !multiProps) {
    throw new Error('multiProps must be defined for cpmm-multi-1')
  }
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'

  const [betAmount, setBetAmount] = useState<number | undefined>(undefined)
  const [lowLimitProb, setLowLimitProb] = useState<number | undefined>()
  const [highLimitProb, setHighLimitProb] = useState<number | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Expiring orders
  const [addExpiration, setAddExpiration] = useState(false)
  const timeInMs = Number(Date.now() + DAY_MS * 7)
  const initDate = dayjs(timeInMs).format('YYYY-MM-DD')
  const initTime = dayjs(timeInMs).format('HH:mm')
  const [expirationDate, setExpirationDate] = useState<string>(initDate)
  const [expirationHoursMinutes, setExpirationHoursMinutes] =
    useState<string>(initTime)
  const expiresAt = addExpiration
    ? dayjs(`${expirationDate}T${expirationHoursMinutes}`).valueOf()
    : undefined

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

    const answerId = multiProps?.answerToBuy.id

    const betsPromise = hasTwoBets
      ? Promise.all([
          placeBet(
            removeUndefinedProps({
              outcome: 'YES',
              amount: yesAmount,
              limitProb: yesLimitProb,
              contractId: contract.id,
              answerId,
              expiresAt,
            })
          ),
          placeBet(
            removeUndefinedProps({
              outcome: 'NO',
              amount: noAmount,
              limitProb: noLimitProb,
              contractId: contract.id,
              answerId,
              expiresAt,
            })
          ),
        ])
      : placeBet(
          removeUndefinedProps({
            outcome: hasYesLimitBet ? 'YES' : 'NO',
            amount: betAmount,
            contractId: contract.id,
            answerId,
            limitProb: hasYesLimitBet ? yesLimitProb : noLimitProb,
            expiresAt,
          })
        )

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
        answerId: multiProps?.answerToBuy.id,
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
        answerId: multiProps?.answerToBuy.id,
      })
    }
  }

  const cpmmState = isCpmmMulti
    ? {
        pool: {
          YES: multiProps!.answerToBuy.poolYes,
          NO: multiProps!.answerToBuy.poolNo,
        },
        p: 0.5,
      }
    : { pool: contract.pool, p: contract.p }

  const initialProb = isCpmmMulti
    ? multiProps!.answerToBuy.prob
    : getProbability(contract)

  const shouldAnswersSumToOne =
    'shouldAnswersSumToOne' in contract ? contract.shouldAnswersSumToOne : false

  const {
    currentPayout: yesPayout,
    currentReturn: yesReturn,
    orderAmount: yesOrderAmount,
    amount: yesFilledAmount,
  } = getBetReturns(
    cpmmState,
    'YES',
    yesAmount,
    yesLimitProb ?? initialProb,
    unfilledBets,
    balanceByUserId,
    shouldAnswersSumToOne ? multiProps : undefined
  )
  const yesReturnPercent = formatPercent(yesReturn)

  const {
    currentPayout: noPayout,
    currentReturn: noReturn,
    orderAmount: noOrderAmount,
    amount: noFilledAmount,
  } = getBetReturns(
    cpmmState,
    'NO',
    noAmount,
    noLimitProb ?? initialProb,
    unfilledBets,
    balanceByUserId,
    multiProps
  )
  const noReturnPercent = formatPercent(noReturn)

  const profitIfBothFilled = shares - (yesAmount + noAmount)

  return (
    <Col className={clsx(className, hidden && 'hidden')}>
      <Row className="mb-4 items-center justify-between">
        <div>
          Place a limit order{' '}
          <InfoTooltip text="Limit orders let you place an order to buy at a specific probability which other users can bet against" />
        </div>

        <OrderBookButton limitBets={unfilledBets} contract={contract} />
      </Row>
      <Row className="mt-1 mb-4 gap-4">
        <Col className="gap-2">
          <div className="text-ink-800 text-sm">
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

        <div>or</div>

        <Col className="gap-2">
          <div className="text-ink-800 text-sm">
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
        ></Row>
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

      <span className="text-ink-800 mt-1 mb-2 text-sm">
        Max amount<span className="text-scarlet-500 ml-0.5">*</span>
      </span>

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

      <div className="mb-4">
        <Button
          className={'mt-4'}
          onClick={() => setAddExpiration(!addExpiration)}
          color={'indigo-outline'}
        >
          {addExpiration ? 'Remove expiration date' : 'Add expiration date'}
        </Button>
        {addExpiration && (
          <Row className="mt-4 gap-2">
            <Input
              type={'date'}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                setExpirationDate(e.target.value)
                if (!expirationHoursMinutes) {
                  setExpirationHoursMinutes(initTime)
                }
              }}
              min={Math.round(Date.now() / MINUTE_MS) * MINUTE_MS}
              disabled={isSubmitting}
              value={expirationDate}
            />
            <Input
              type={'time'}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setExpirationHoursMinutes(e.target.value)}
              min={'00:00'}
              disabled={isSubmitting}
              value={expirationHoursMinutes}
            />
          </Row>
        )}
      </div>

      <Col className="mt-2 w-full gap-3">
        {(hasTwoBets || (hasYesLimitBet && yesFilledAmount !== 0)) && (
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
              {formatMoney(yesFilledAmount)} of {formatMoney(yesOrderAmount)}
            </div>
          </Row>
        )}
        {(hasTwoBets || (hasNoLimitBet && noFilledAmount !== 0)) && (
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
              {formatMoney(noFilledAmount)} of {formatMoney(noOrderAmount)}
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

const getBetReturns = (
  cpmmState: CpmmState,
  outcome: 'YES' | 'NO',
  betAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  arbitrageProps?: {
    answers: Answer[]
    answerToBuy: Answer
  }
) => {
  const orderAmount = betAmount
  let amount = 0
  let shares: number
  if (arbitrageProps) {
    const { answers, answerToBuy } = arbitrageProps
    ;({ amount, shares } = calculateCpmmMultiArbitrageBet(
      answers,
      answerToBuy,
      outcome,
      betAmount,
      limitProb,
      unfilledBets,
      balanceByUserId
    ))
  } else {
    ;({ amount, shares } = computeCpmmBet(
      cpmmState,
      outcome,
      betAmount,
      limitProb,
      unfilledBets,
      balanceByUserId
    ))
  }

  const remainingMatched = limitProb
    ? ((orderAmount ?? 0) - amount) /
      (outcome === 'YES' ? limitProb : 1 - limitProb)
    : 0
  const currentPayout = shares + remainingMatched
  const currentReturn = betAmount ? (currentPayout - betAmount) / betAmount : 0

  return { orderAmount, amount, shares, currentPayout, currentReturn }
}
