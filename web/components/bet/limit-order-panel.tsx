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
  CPMMNumericContract,
  getBinaryMCProb,
  isBinaryMulti,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import { computeCpmmBet } from 'common/new-bet'
import { formatMoney, formatPercent } from 'common/util/format'
import { DAY_MS, HOUR_MS, MINUTE_MS, WEEK_MS } from 'common/util/time'
import { Input } from 'web/components/widgets/input'
import { User } from 'web/lib/firebase/users'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { BinaryOutcomeLabel, PseudoNumericOutcomeLabel } from '../outcome-label'
import { BuyAmountInput } from '../widgets/amount-input'
import { OrderBookButton } from './order-book'
import { ProbabilityOrNumericInput } from '../widgets/probability-input'
import { getPseudoProbability } from 'common/pseudo-numeric'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { MultiBetProps } from 'web/components/bet/bet-panel'
import { track } from '@amplitude/analytics-browser'
import { APIError } from 'common/api/utils'
import { removeUndefinedProps } from 'common/util/object'
import { api } from 'web/lib/firebase/api'

export default function LimitOrderPanel(props: {
  contract:
    | CPMMBinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
    | CPMMNumericContract
  multiProps?: MultiBetProps
  user: User | null | undefined
  unfilledBets: LimitBet[]
  balanceByUserId: { [userId: string]: number }

  onBuySuccess?: () => void
  className?: string
  outcome: 'YES' | 'NO' | undefined
}) {
  const {
    contract,
    multiProps,
    unfilledBets,
    balanceByUserId,
    user,
    outcome,
    onBuySuccess,
  } = props
  const isBinaryMC = isBinaryMulti(contract)
  const binaryMCOutcome =
    isBinaryMC && multiProps
      ? multiProps.answerText === multiProps.answerToBuy.text
        ? 'YES'
        : 'NO'
      : undefined
  const isCpmmMulti = contract.mechanism === 'cpmm-multi-1'
  if (isCpmmMulti && !multiProps) {
    throw new Error('multiProps must be defined for cpmm-multi-1')
  }
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'

  const [betAmount, setBetAmount] = useState<number | undefined>(undefined)
  const [error, setError] = useState<string | undefined>()
  const [inputError, setInputError] = useState<boolean>(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Expiring orders
  const [addExpiration, setAddExpiration] = usePersistentInMemoryState(
    false,
    'add-limit-order-expiration'
  )
  const initTimeInMs = Number(Date.now() + 5 * MINUTE_MS)
  const initDate = dayjs(initTimeInMs).format('YYYY-MM-DD')
  const initTime = dayjs(initTimeInMs).format('HH:mm')
  const [expirationDate, setExpirationDate] =
    usePersistentInMemoryState<string>(initDate, 'limit-order-expiration-date')
  const [expirationHoursMinutes, setExpirationHoursMinutes] =
    usePersistentInMemoryState<string>(initTime, 'limit-order-expiration-time')

  const expiresAt = addExpiration
    ? dayjs(`${expirationDate}T${expirationHoursMinutes}`).valueOf()
    : undefined

  const [limitProbInt, setLimitProbInt] = useState<number | undefined>(
    undefined
  )

  const hasLimitBet = !!limitProbInt && !!betAmount

  const betDisabled =
    isSubmitting || !outcome || !betAmount || !!error || !hasLimitBet

  const preLimitProb =
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
  const limitProb =
    !preLimitProb || !isBinaryMC
      ? preLimitProb
      : getBinaryMCProb(preLimitProb, outcome as 'YES' | 'NO')

  const amount = betAmount ?? 0

  function onBetChange(newAmount: number | undefined) {
    setBetAmount(newAmount)
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

  async function submitBet() {
    if (!user || betDisabled) return

    setError(undefined)
    setIsSubmitting(true)

    const answerId = multiProps?.answerToBuy.id

    await api(
      'bet',
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
          setError(e.message.toString())
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
    binaryMCOutcome ?? outcome ?? 'YES',
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
    <>
      <Col className="relative my-2 w-full gap-3">
        <Row className="text-ink-700 w-full items-center gap-3">
          {isPseudoNumeric ? 'Value' : 'Probability'}
          <ProbabilityOrNumericInput
            contract={contract}
            prob={limitProbInt}
            setProb={setLimitProbInt}
            error={inputError}
            onRangeError={setInputError}
            disabled={isSubmitting}
          />

          <OrderBookButton
            limitBets={unfilledBetsMatchingAnswer}
            contract={contract}
          />
        </Row>
      </Col>

      <BuyAmountInput
        amount={betAmount}
        onChange={onBetChange}
        error={error}
        setError={setError}
        disabled={isSubmitting}
        showSlider
      />

      <div className="my-3">
        <Button
          className={'mt-4'}
          onClick={() => setAddExpiration(!addExpiration)}
          color={'indigo-outline'}
          disabled={isSubmitting}
        >
          {addExpiration ? 'Remove expiration date' : 'Add expiration date'}
        </Button>
        {addExpiration && (
          <Row className="mt-4 flex-wrap gap-2">
            <Input
              type={'date'}
              className="dark:date-range-input-white"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                setExpirationDate(e.target.value)
                if (!expirationHoursMinutes) {
                  setExpirationHoursMinutes(initTime)
                }
              }}
              min={dayjs().format('YYYY-MM-DD')}
              max="9999-12-31"
              disabled={isSubmitting}
              value={expirationDate}
            />
            <Input
              type={'time'}
              className="dark:date-range-input-white"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setExpirationHoursMinutes(e.target.value)}
              disabled={isSubmitting}
              value={expirationHoursMinutes}
            />
            <Button
              color={'indigo-outline'}
              size={'sm'}
              onClick={() => {
                const num =
                  dayjs(
                    `${expirationDate}T${expirationHoursMinutes}`
                  ).valueOf() + MINUTE_MS
                const addTime = dayjs(num).format('HH:mm')
                setExpirationHoursMinutes(addTime)
              }}
            >
              + 1Min
            </Button>{' '}
            <Button
              color={'indigo-outline'}
              size={'sm'}
              onClick={() => {
                const num =
                  dayjs(
                    `${expirationDate}T${expirationHoursMinutes}`
                  ).valueOf() + HOUR_MS
                const addTime = dayjs(num).format('HH:mm')
                setExpirationHoursMinutes(addTime)
              }}
            >
              + 1Hr
            </Button>
            <Button
              color={'indigo-outline'}
              size={'sm'}
              onClick={() => {
                const num = dayjs(expirationDate).valueOf() + DAY_MS
                const addDay = dayjs(num).format('YYYY-MM-DD')
                setExpirationDate(addDay)
              }}
            >
              + 1D
            </Button>
            <Button
              color={'indigo-outline'}
              size={'sm'}
              onClick={() => {
                const num = dayjs(expirationDate).valueOf() + WEEK_MS
                const addDay = dayjs(num).format('YYYY-MM-DD')
                setExpirationDate(addDay)
              }}
            >
              + 1W
            </Button>
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
                !isBinaryMC && <BinaryOutcomeLabel outcome={outcome} />
              )}{' '}
              {isBinaryMC ? 'Filled' : 'filled'} now
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
                    Max{' '}
                    {!isBinaryMC && <BinaryOutcomeLabel outcome={outcome} />}{' '}
                    payout
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

        <Row className="items-center justify-between gap-2">
          {user && (
            <Button
              size="xl"
              disabled={betDisabled || inputError}
              color={
                binaryMCOutcome === 'YES'
                  ? 'indigo'
                  : binaryMCOutcome === 'NO'
                  ? 'amber'
                  : outcome === 'YES'
                  ? 'green'
                  : 'red'
              }
              loading={isSubmitting}
              className="flex-1"
              onClick={submitBet}
            >
              {isSubmitting
                ? 'Submitting...'
                : !outcome
                ? 'Choose YES or NO'
                : !limitProb
                ? 'Enter a probability'
                : !betAmount
                ? 'Enter an amount'
                : binaryMCOutcome
                ? `Submit order for ${formatMoney(
                    betAmount
                  )} at ${formatPercent(preLimitProb ?? 0)}`
                : `Submit ${outcome} order for ${formatMoney(
                    betAmount
                  )} at ${formatPercent(limitProb)}`}
            </Button>
          )}
        </Row>
      </Col>
    </>
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
  let amount: number
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
