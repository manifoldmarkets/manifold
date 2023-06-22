import clsx from 'clsx'
import dayjs from 'dayjs'
import { clamp, sumBy } from 'lodash'
import { useState } from 'react'

import { Answer } from 'common/answer'
import { LimitBet } from 'common/bet'
import { getProbability } from 'common/calculate'
import {
  CPMMBinaryContract,
  CPMMMultiContract,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import { formatMoney, formatPercent } from 'common/util/format'
import { removeUndefinedProps } from 'common/util/object'
import { DAY_MS, MINUTE_MS } from 'common/util/time'
import { Input } from 'web/components/widgets/input'
import { APIError, placeBet } from 'web/lib/firebase/api'
import { User } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'
import { BinaryOutcomeLabel, HigherLabel, LowerLabel } from '../outcome-label'
import { BuyAmountInput } from '../widgets/amount-input'
import { OrderBookButton } from './limit-bets'
import { LimitSlider, convertNumberToProb } from './limit-slider'
import { CpmmState } from 'common/calculate-cpmm'
import { calculateCpmmMultiArbitrageBet } from 'common/calculate-cpmm-arbitrage'
import { computeCpmmBet } from 'common/new-bet'

export default function LimitOrderPanel(props: {
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

  const [betAmount, setBetAmount] = useState<number | undefined>(10)
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

  const MAX_PROB = isPseudoNumeric ? contract.max : 100
  const MIN_PROB = isPseudoNumeric ? contract.min : 0

  const [lowLimitProb, setLowLimitProb] = useState<number | undefined>(
    undefined
  )
  const [highLimitProb, setHighLimitProb] = useState<number | undefined>(
    undefined
  )

  const hasYesLimitBet = lowLimitProb !== undefined && !!betAmount
  const hasNoLimitBet = highLimitProb !== undefined && !!betAmount

  const hasTwoBets = hasYesLimitBet && hasNoLimitBet
  const invalidLowAndHighBet =
    !!lowLimitProb && !!highLimitProb && lowLimitProb >= highLimitProb

  const betDisabled =
    isSubmitting ||
    !betAmount ||
    !!error ||
    (!hasYesLimitBet && !hasNoLimitBet) ||
    invalidLowAndHighBet

  const yesLimitProb =
    lowLimitProb === undefined
      ? undefined
      : clamp(
          convertNumberToProb(
            lowLimitProb,
            isPseudoNumeric,
            MIN_PROB,
            MAX_PROB
          ) / 100,
          0.001,
          0.999
        )
  const noLimitProb =
    highLimitProb === undefined
      ? undefined
      : clamp(
          convertNumberToProb(
            highLimitProb,
            isPseudoNumeric,
            MIN_PROB,
            MAX_PROB
          ) / 100,
          0.001,
          0.999
        )

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
        setLowLimitProb(10)
        setHighLimitProb(90)
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

  const unfilledBetsMatchingAnswer = unfilledBets.filter(
    (b) => b.answerId === multiProps?.answerToBuy?.id
  )

  return (
    <Col className={clsx(className, hidden && 'hidden')}>
      <Row className="mb-4 items-center justify-between">
        <div>Limit orders</div>

        <OrderBookButton
          limitBets={unfilledBetsMatchingAnswer}
          contract={contract}
        />
      </Row>
      <LimitSlider
        isPseudoNumeric={isPseudoNumeric}
        contract={contract}
        lowLimitProb={lowLimitProb}
        setLowLimitProb={setLowLimitProb}
        highLimitProb={highLimitProb}
        setHighLimitProb={setHighLimitProb}
        maxProb={MAX_PROB}
        minProb={MIN_PROB}
        isSubmitting={isSubmitting}
        invalidLowAndHighBet={invalidLowAndHighBet}
      />

      <Spacer h={6} />

      <span className="text-ink-800 mb-2 text-sm">
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
    const { newBetResult } = calculateCpmmMultiArbitrageBet(
      answers,
      answerToBuy,
      outcome,
      betAmount,
      limitProb,
      unfilledBets,
      balanceByUserId
    )
    amount = sumBy(newBetResult.takers, 'amount')
    shares = sumBy(newBetResult.takers, 'shares')
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
