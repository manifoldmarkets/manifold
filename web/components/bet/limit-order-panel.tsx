import clsx from 'clsx'
import dayjs from 'dayjs'
import { clamp, sumBy } from 'lodash'
import { useState } from 'react'

import { Answer } from 'common/answer'
import { LimitBet } from 'common/bet'
import { getProbability } from 'common/calculate'
import { CpmmState } from 'common/calculate-cpmm'
import { calculateCpmmMultiArbitrageBet } from 'common/calculate-cpmm-arbitrage'
import {
  CPMMBinaryContract,
  CPMMMultiContract,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import { computeCpmmBet } from 'common/new-bet'
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
import { BinaryOutcomeLabel, PseudoNumericOutcomeLabel } from '../outcome-label'
import { BuyAmountInput } from '../widgets/amount-input'
import { OrderBookButton } from './order-book'
import { YesNoSelector } from './yes-no-selector'
import { ProbabilityOrNumericInput } from '../widgets/probability-input'
import { getPseudoProbability } from 'common/pseudo-numeric'

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
    className,
  } = props

  const isCpmmMulti = contract.mechanism === 'cpmm-multi-1'
  if (isCpmmMulti && !multiProps) {
    throw new Error('multiProps must be defined for cpmm-multi-1')
  }
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'

  const [betAmount, setBetAmount] = useState<number | undefined>(10)
  const [error, setError] = useState<string | undefined>()
  const [inputError, setInputError] = useState<boolean>(false)
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

  const [limitProbInt, setLimitProbInt] = useState<number | undefined>(
    undefined
  )

  const [outcome, setOutcome] = useState<'YES' | 'NO' | undefined>(undefined)

  const hasLimitBet = !!limitProbInt && !!betAmount

  const betDisabled =
    isSubmitting || !outcome || !betAmount || !!error || !hasLimitBet

  const limitProb =
    limitProbInt === undefined
      ? undefined
      : clamp(
          isPseudoNumeric
            ? getPseudoProbability(
                limitProbInt,
                contract.min,
                contract.max,
                contract.isLogScale
              )
            : limitProbInt / 100,
          0.001,
          0.999
        )

  const amount = betAmount ?? 0

  function onBetChange(newAmount: number | undefined) {
    setBetAmount(newAmount)
  }

  async function submitBet() {
    if (!user || betDisabled) return

    setError(undefined)
    setIsSubmitting(true)

    const answerId = multiProps?.answerToBuy.id

    await placeBet(
      removeUndefinedProps({
        outcome,
        amount,
        contractId: contract.id,
        answerId,
        limitProb: limitProb,
        expiresAt,
      })
    )
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
        if (onBuySuccess) onBuySuccess()
      })

    await track('bet', {
      location: 'bet panel',
      outcomeType: contract.outcomeType,
      slug: contract.slug,
      contractId: contract.id,
      amount,
      outcome,
      limitProb: limitProb,
      isLimitOrder: true,
      answerId: multiProps?.answerToBuy.id,
    })
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
    currentPayout,
    currentReturn,
    orderAmount,
    amount: filledAmount,
  } = getBetReturns(
    cpmmState,
    outcome!,
    amount,
    limitProb ?? initialProb,
    unfilledBets,
    balanceByUserId,
    shouldAnswersSumToOne ? multiProps : undefined
  )
  const returnPercent = formatPercent(currentReturn)

  const unfilledBetsMatchingAnswer = unfilledBets.filter(
    (b) => b.answerId === multiProps?.answerToBuy?.id
  )

  return (
    <Col className={clsx(className, hidden && 'hidden')}>
      <Row className="mb-4 items-center justify-between">
        <div className="text-lg">Place a limit order</div>

        <OrderBookButton
          limitBets={unfilledBetsMatchingAnswer}
          contract={contract}
        />
      </Row>

      <Col className="relative mb-8 w-full gap-3">
        <Row className="items-center gap-3">
          Outcome
          <YesNoSelector
            selected={outcome}
            onSelect={(selected) => setOutcome(selected)}
            disabled={isSubmitting}
          />
        </Row>
        <Row className="w-full items-center gap-3">
          Probability
          <ProbabilityOrNumericInput
            contract={contract}
            prob={limitProbInt}
            setProb={setLimitProbInt}
            inputError={inputError}
            setInputError={setInputError}
            disabled={isSubmitting}
          />
        </Row>
      </Col>

      <span className="text-ink-800 mb-2 text-sm">Amount</span>

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
          disabled={isSubmitting}
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
        {outcome && hasLimitBet && filledAmount > 0 && (
          <Row className="items-center justify-between gap-2 text-sm">
            <div className="text-ink-500 whitespace-nowrap">
              {isPseudoNumeric ? (
                <PseudoNumericOutcomeLabel outcome={outcome} />
              ) : (
                <BinaryOutcomeLabel outcome={outcome} />
              )}{' '}
              filled now
            </div>
            <div className="mr-2 whitespace-nowrap">
              {formatMoney(filledAmount)} of {formatMoney(orderAmount)}
            </div>
          </Row>
        )}

        {outcome && hasLimitBet && (
          <Row className="items-center justify-between gap-2 text-sm">
            <Row className="text-ink-500 flex-nowrap items-center gap-2 whitespace-nowrap">
              <div>
                {isPseudoNumeric ? (
                  'Shares'
                ) : (
                  <>
                    Max <BinaryOutcomeLabel outcome={outcome} /> payout
                  </>
                )}
              </div>
            </Row>
            <div>
              <span className="mr-2 whitespace-nowrap">
                {formatMoney(currentPayout)}
              </span>
              ({returnPercent})
            </div>
          </Row>
        )}

        {hasLimitBet && <Spacer h={8} />}
      </Col>

      {user && (
        <Button
          size="xl"
          disabled={betDisabled || inputError}
          color={'indigo'}
          loading={isSubmitting}
          className="flex-1"
          onClick={submitBet}
        >
          {isSubmitting ? 'Submitting...' : `Submit order`}
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
