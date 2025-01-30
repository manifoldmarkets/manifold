import dayjs from 'dayjs'
import { clamp, sumBy } from 'lodash'
import { useRef, useState } from 'react'
import toast from 'react-hot-toast'

import { Answer } from 'common/answer'
import { LimitBet } from 'common/bet'
import { getProbability } from 'common/calculate'
import { CpmmState, getCpmmProbability } from 'common/calculate-cpmm'
import { calculateCpmmMultiArbitrageBet } from 'common/calculate-cpmm-arbitrage'
import {
  BinaryContract,
  CPMMMultiContract,
  CPMMNumericContract,
  getBinaryMCProb,
  isBinaryMulti,
  MAX_CPMM_PROB,
  MIN_CPMM_PROB,
  MultiContract,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import { computeCpmmBet } from 'common/new-bet'
import { formatPercent } from 'common/util/format'
import { DAY_MS, HOUR_MS, MINUTE_MS, MONTH_MS, WEEK_MS } from 'common/util/time'
import { Input } from 'web/components/widgets/input'
import { firebaseLogin, User } from 'web/lib/firebase/users'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { BinaryOutcomeLabel, PseudoNumericOutcomeLabel } from '../outcome-label'
import { BuyAmountInput } from '../widgets/amount-input'
import { getPseudoProbability } from 'common/pseudo-numeric'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { MultiBetProps } from 'web/components/bet/bet-panel'
import { track, withTracking } from 'web/lib/service/analytics'
import { APIError } from 'common/api/utils'
import { addObjects, removeUndefinedProps } from 'common/util/object'
import { api } from 'web/lib/api/api'
import clsx from 'clsx'
import { getAnswerColor } from '../charts/contract/choice'
import { noFees } from 'common/fees'
import { MoneyDisplay } from './money-display'
import { TRADE_TERM } from 'common/envs/constants'
import { capitalize } from 'lodash'
import { LocationMonitor } from '../gidx/location-monitor'
import { VerifyButton } from '../sweeps/sweep-verify-section'
import { sliderColors } from '../widgets/slider'
import { ChoicesToggleGroup } from '../widgets/choices-toggle-group'
import { ProbabilitySlider } from '../widgets/probability-input'

export default function LimitOrderPanel(props: {
  contract:
    | BinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
    | CPMMNumericContract
  multiProps?: MultiBetProps
  user: User | null | undefined
  unfilledBets: LimitBet[]
  balanceByUserId: { [userId: string]: number }
  kycError: string | undefined
  shouldPromptVerification?: boolean
  onBuySuccess?: () => void
  className?: string
  betAmount?: number
  outcome: 'YES' | 'NO' | undefined
  pseudonym?: {
    YES: {
      pseudonymName: string
      pseudonymColor: keyof typeof sliderColors
    }
    NO: {
      pseudonymName: string
      pseudonymColor: keyof typeof sliderColors
    }
  }
}) {
  const {
    contract,
    multiProps,
    unfilledBets,
    balanceByUserId,
    user,
    kycError,
    outcome,
    onBuySuccess,
    pseudonym,
    shouldPromptVerification,
  } = props
  const { pseudonymName, pseudonymColor } =
    pseudonym?.[outcome as 'YES' | 'NO'] ?? {}
  const isBinaryMC = isBinaryMulti(contract)
  const binaryMCColors = isBinaryMC
    ? (contract as MultiContract).answers.map(getAnswerColor)
    : undefined

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

  const isCashContract = contract.token === 'CASH'

  const [betAmount, setBetAmount] = useState<number | undefined>(
    props.betAmount
  )
  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const betDeps = useRef<LimitBet[]>()
  // Expiring orders
  const [addCustomExpiration, setAddCustomExpiration] =
    usePersistentInMemoryState(false, 'add-limit-order-expiration')
  const initTimeInMs = Number(Date.now() + 5 * MINUTE_MS)
  const initDate = dayjs(initTimeInMs).format('YYYY-MM-DD')
  const initTime = dayjs(initTimeInMs).format('HH:mm')
  const [expirationDate, setExpirationDate] =
    usePersistentInMemoryState<string>(initDate, 'limit-order-expiration-date')
  const [expirationHoursMinutes, setExpirationHoursMinutes] =
    usePersistentInMemoryState<string>(initTime, 'limit-order-expiration-time')

  const expirationChoices: { [key: string]: number } = {
    '0s': 1,
    '1s': 1000,
    '1h': HOUR_MS,
    '1d': DAY_MS,
    '1w': WEEK_MS,
    '1m': MONTH_MS,
    '+': -1,
  }

  const [selectedExpiration, setSelectedExpiration] =
    usePersistentInMemoryState<string | number>(
      'Never',
      'limit-order-expiration'
    )
  const expiresAt = addCustomExpiration
    ? dayjs(`${expirationDate}T${expirationHoursMinutes}`).valueOf()
    : undefined

  const expiresMillisAfter =
    !addCustomExpiration &&
    selectedExpiration !== -1 &&
    selectedExpiration !== 'Never'
      ? expirationChoices[selectedExpiration]
      : undefined

  const initialProb =
    isBinaryMC && outcome === 'YES'
      ? multiProps!.answerToBuy.prob
      : isBinaryMC && outcome === 'NO'
      ? 1 - multiProps!.answerToBuy.prob
      : isCpmmMulti
      ? multiProps!.answerToBuy.prob
      : getProbability(contract)

  const [limitProbInt, setLimitProbInt] = useState<number | undefined>(
    Math.round(initialProb * 100)
  )
  const [showLocationMonitor, setShowLocationMonitor] = useState(false)

  const hasLimitBet = !!limitProbInt && !!betAmount

  const betDisabled =
    isSubmitting ||
    !outcome ||
    !betAmount ||
    !hasLimitBet ||
    error === 'Insufficient balance' ||
    showLocationMonitor ||
    !!kycError

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
        collectedFees: contract.collectedFees,
      }
    : {
        pool: contract.pool,
        p: contract.p,
        collectedFees: contract.collectedFees,
      }

  async function submitBet() {
    if (!user || betDisabled) return

    setError(undefined)
    setIsSubmitting(true)

    const answerId = multiProps?.answerToBuy.id

    try {
      const bet = await toast.promise(
        api(
          'bet',
          removeUndefinedProps({
            outcome,
            amount,
            contractId: contract.id,
            answerId,
            limitProb: limitProb,
            expiresAt: addCustomExpiration ? expiresAt : undefined,
            expiresMillisAfter,
            deps: betDeps.current?.map((b) => b.userId),
          })
        ),
        {
          loading: `Submitting ${TRADE_TERM}...`,
          success: `${capitalize(TRADE_TERM)} submitted!`,
          error: `Error submitting ${TRADE_TERM}`,
        }
      )

      console.log(`placed ${TRADE_TERM}. Result:`, bet)
      if (onBuySuccess) onBuySuccess()

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
        token: contract.token,
      })
    } catch (e) {
      if (e instanceof APIError) {
        setError(e.message.toString())
      } else {
        console.error(e)
        setError(`Error placing ${TRADE_TERM}`)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const shouldAnswersSumToOne =
    'shouldAnswersSumToOne' in contract ? contract.shouldAnswersSumToOne : false

  let currentPayout = 0
  let currentReturn = 0
  let orderAmount = 0
  let filledAmount = 0
  // let fees = noFees
  try {
    const result = getLimitBetReturns(
      cpmmState,
      binaryMCOutcome ?? outcome ?? 'YES',
      amount,
      limitProb ?? initialProb,
      unfilledBets,
      balanceByUserId,
      setError,
      shouldAnswersSumToOne ? multiProps : undefined
    )
    currentPayout = result.currentPayout
    currentReturn = result.currentReturn
    orderAmount = result.orderAmount
    filledAmount = result.amount
    // fees = result.fees
    betDeps.current = result.betDeps
  } catch (err: any) {
    console.error('Error in calculateCpmmMultiArbitrageBet:', err)
    setError(
      err?.message ??
        `An error occurred during ${TRADE_TERM} calculation, try again.`
    )
  }
  const returnPercent = formatPercent(currentReturn)
  // const totalFees = getFeeTotal(fees)
  const hideYesNo = isBinaryMC || !!pseudonym

  return (
    <>
      <Row className={'text-ink-700 items-center space-x-3'}>
        {capitalize(TRADE_TERM)} amount
      </Row>
      <BuyAmountInput
        parentClassName="mt-2 max-w-full"
        amount={betAmount}
        onChange={onBetChange}
        error={error}
        setError={setError}
        disabled={isSubmitting}
        showSlider
        token={isCashContract ? 'CASH' : 'M$'}
        sliderColor={pseudonymColor}
        disregardUserBalance={shouldPromptVerification}
      />
      <Col className="relative my-6 w-full gap-2">
        <span className="text-ink-700">
          {isPseudoNumeric ? 'Value' : `Probability:`}
          <span className="text-ink-700 font-semibold"> {limitProbInt}%</span>
        </span>
        <Row className="gap-2">
          {[-5, -1, 1, 5].map((increment) => (
            <Button
              key={increment}
              color="gray-white"
              onClick={() => setLimitProbInt((limitProbInt ?? 0) + increment)}
              className="bg-canvas-0 h-7 w-24"
            >
              {increment > 0 ? `+${increment}` : increment}
            </Button>
          ))}
        </Row>
        <ProbabilitySlider
          prob={limitProbInt}
          onProbChange={setLimitProbInt}
          disabled={isSubmitting}
          color={pseudonymColor}
          outcome={outcome}
        />
      </Col>
      <Col className="my-3 gap-2">
        <span className="text-ink-700">
          Expiration{selectedExpiration === 'Never' ? ' (none)' : ''}
        </span>
        <Row className="-ml-2 items-baseline justify-between gap-2 sm:justify-start sm:gap-4">
          <ChoicesToggleGroup
            color="light"
            onSameChoiceClick={() => {
              setSelectedExpiration('Never')
              setAddCustomExpiration(false)
            }}
            choicesMap={expirationChoices}
            currentChoice={selectedExpiration}
            setChoice={(choice) => {
              setAddCustomExpiration(choice === -1)
              setSelectedExpiration(choice as number)
            }}
          />
        </Row>
        {addCustomExpiration && (
          <Col className="gap-2">
            <Row className="mt-4 gap-2">
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
                step={60}
              />
            </Row>
            <Row className="gap-2">
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
                + 1m
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
                + 1h
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
                + 1d
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
                + 1w
              </Button>
              <Button
                color={'indigo-outline'}
                size={'sm'}
                onClick={() => {
                  const num = dayjs(expirationDate).valueOf() + MONTH_MS
                  const addDay = dayjs(num).format('YYYY-MM-DD')
                  setExpirationDate(addDay)
                }}
              >
                + 1m
              </Button>
            </Row>
          </Col>
        )}
      </Col>

      <Col className="mt-2 w-full gap-3">
        {outcome && hasLimitBet && filledAmount > 0 && (
          <Row className="items-center justify-between gap-2 text-sm">
            <div className="text-ink-500 whitespace-nowrap">
              {isPseudoNumeric ? (
                <PseudoNumericOutcomeLabel outcome={outcome} />
              ) : (
                !hideYesNo && <BinaryOutcomeLabel outcome={outcome} />
              )}{' '}
              {hideYesNo ? 'Filled' : 'filled'} now
            </div>
            <div className="mr-2 whitespace-nowrap">
              <MoneyDisplay
                amount={filledAmount}
                isCashContract={isCashContract}
              />{' '}
              of{' '}
              <MoneyDisplay
                amount={orderAmount}
                isCashContract={isCashContract}
              />
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
                    Max {!hideYesNo && <BinaryOutcomeLabel outcome={outcome} />}{' '}
                    payout
                  </>
                )}
              </div>
            </Row>
            <div>
              <span className="mr-2 whitespace-nowrap">
                <MoneyDisplay
                  amount={currentPayout}
                  isCashContract={isCashContract}
                />
              </span>
              ({returnPercent})
            </div>
          </Row>
        )}

        {/* <Row className="items-center justify-between gap-2 text-sm">
          <Row className="text-ink-500 flex-nowrap items-center gap-2 whitespace-nowrap">
            Fees
          </Row>
          <FeeDisplay
            amount={filledAmount}
            totalFees={totalFees}
            isCashContract={isCashContract}
          />
        </Row> */}

        {kycError && !shouldPromptVerification && user && (
          <div className="text-red-500">{kycError}</div>
        )}

        <Col className="gap-2">
          {user ? (
            shouldPromptVerification ? (
              <VerifyButton
                redirectHereAfterVerify
                content={<span>Verify to {TRADE_TERM}</span>}
              />
            ) : (
              <>
                <LocationMonitor
                  contract={contract}
                  user={user}
                  setShowPanel={setShowLocationMonitor}
                  showPanel={showLocationMonitor}
                />
                <Row className="items-center justify-between gap-2">
                  <Button
                    size="xl"
                    disabled={betDisabled}
                    color={
                      (pseudonymColor as any) ??
                      (hideYesNo ? 'none' : outcome === 'YES' ? 'green' : 'red')
                    }
                    loading={isSubmitting}
                    className={clsx('flex-1 text-white')}
                    style={{
                      backgroundColor:
                        binaryMCColors?.[outcome == 'YES' ? 0 : 1],
                    }}
                    onClick={submitBet}
                  >
                    {isSubmitting ? (
                      'Submitting...'
                    ) : !outcome ? (
                      'Choose YES or NO'
                    ) : !limitProb ? (
                      'Enter a probability'
                    ) : !betAmount ? (
                      'Enter an amount'
                    ) : (
                      <span>
                        Place{' '}
                        <MoneyDisplay
                          amount={betAmount}
                          isCashContract={isCashContract}
                        />{' '}
                        {!binaryMCOutcome && !pseudonymName
                          ? `${outcome.toLowerCase()} `
                          : ''}
                        order at{' '}
                        {formatPercent(
                          binaryMCOutcome || pseudonymName
                            ? preLimitProb ?? 0
                            : limitProb
                        )}
                      </span>
                    )}
                  </Button>
                </Row>
              </>
            )
          ) : (
            <Button
              color={outcome === 'NO' ? 'red' : 'green'}
              size="xl"
              onClick={withTracking(firebaseLogin, 'login from bet panel', {
                token: contract.token,
              })}
              className="mb-2 flex-grow"
            >
              Sign up to predict
            </Button>
          )}
        </Col>
      </Col>
    </>
  )
}

export const getLimitBetReturns = (
  cpmmState: CpmmState,
  outcome: 'YES' | 'NO',
  betAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  setError: (error: string) => void,
  arbitrageProps?: {
    answers: Answer[]
    answerToBuy: Answer
  }
) => {
  const orderAmount = betAmount
  let amount = 0
  let shares = 0
  let fees = noFees
  let betDeps: LimitBet[] = []
  let probAfter = 0
  try {
    if (arbitrageProps) {
      const { answers, answerToBuy } = arbitrageProps
      const { newBetResult, otherBetResults } = calculateCpmmMultiArbitrageBet(
        answers,
        answerToBuy,
        outcome,
        betAmount,
        limitProb,
        unfilledBets,
        balanceByUserId,
        cpmmState.collectedFees
      )
      amount = sumBy(newBetResult.takers, 'amount')
      shares = sumBy(newBetResult.takers, 'shares')
      betDeps = newBetResult.makers
        .map((m) => m.bet)
        .concat(otherBetResults.flatMap((r) => r.makers.map((m) => m.bet)))
        .concat(newBetResult.ordersToCancel)
        .concat(otherBetResults.flatMap((r) => r.ordersToCancel))
      fees = addObjects(
        newBetResult.totalFees,
        otherBetResults.reduce(
          (feeSum, results) => addObjects(feeSum, results.totalFees),
          noFees
        )
      )
      probAfter = getCpmmProbability(
        newBetResult.cpmmState.pool,
        newBetResult.cpmmState.p
      )
    } else {
      const result = computeCpmmBet(
        cpmmState,
        outcome,
        betAmount,
        limitProb,
        unfilledBets,
        balanceByUserId,
        !arbitrageProps && { max: MAX_CPMM_PROB, min: MIN_CPMM_PROB }
      )
      amount = result.amount
      shares = result.shares
      fees = result.fees
      betDeps = result.makers.map((m) => m.bet).concat(result.ordersToCancel)
      probAfter = result.probAfter
    }
  } catch (err: any) {
    console.error('Error in getLimitBetReturns:', err)
    setError(
      err?.message ??
        `An error occurred during ${TRADE_TERM} calculation, try again.`
    )
  }
  const remainingMatched = limitProb
    ? ((orderAmount ?? 0) - amount) /
      (outcome === 'YES' ? limitProb : 1 - limitProb)
    : 0
  const currentPayout = shares + remainingMatched
  const currentReturn = betAmount ? (currentPayout - betAmount) / betAmount : 0

  return {
    orderAmount,
    amount,
    shares,
    currentPayout,
    currentReturn,
    fees,
    betDeps,
    probAfter,
  }
}
