import dayjs from 'dayjs'
import { capitalize, clamp } from 'lodash'
import { useEffect, useRef, useState } from 'react'
import { LimitBet } from 'common/bet'
import { getProbability } from 'common/calculate'
import {
  getBinaryMCProb,
  isBinaryMulti,
  MarketContract,
  MultiContract,
} from 'common/contract'
import { formatOutcomeLabel, formatPercent } from 'common/util/format'
import { DAY_MS, HOUR_MS, MINUTE_MS, MONTH_MS, WEEK_MS } from 'common/util/time'
import { Input } from 'web/components/widgets/input'
import { firebaseLogin, User } from 'web/lib/firebase/users'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { BinaryOutcomeLabel, PseudoNumericOutcomeLabel } from '../outcome-label'
import { BuyAmountInput } from '../widgets/amount-input'
import { getPseudoProbability } from 'common/pseudo-numeric'
import { track, withTracking } from 'web/lib/service/analytics'
import { APIError } from 'common/api/utils'
import { removeUndefinedProps } from 'common/util/object'
import { api } from 'web/lib/api/api'
import clsx from 'clsx'
import { getAnswerColor } from '../charts/contract/choice'
import { MoneyDisplay } from './money-display'
import { TRADE_TERM } from 'common/envs/constants'
import { sliderColors } from '../widgets/slider'
import { ProbabilitySlider } from '../widgets/probability-input'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { APIParams } from 'common/api/schema'
import { getLimitBetReturns, MultiBetProps } from 'client-common/lib/bet'
import DropdownMenu from '../widgets/dropdown-menu'
import { SelectorIcon } from '@heroicons/react/solid'
import { InfoTooltip } from '../widgets/info-tooltip'
import { LuShare } from 'react-icons/lu'
import { ShareBetModal } from './share-bet'
import { Bet } from 'common/bet'
import { useEvent } from 'client-common/hooks/use-event'
import { CandidateBet } from 'common/new-bet'

const expirationOptions = [
  { label: 'Never expires', value: 0 },
  { label: 'Expires immediately', value: 1 },
  { label: 'Expires in 1 hour', value: HOUR_MS },
  { label: 'Expires in 1 day', value: DAY_MS },
  { label: 'Expires in 1 week', value: WEEK_MS },
  { label: 'Expires in 1 month', value: MONTH_MS },
  { label: 'Custom time...', value: -1 },
]

const WAIT_TO_DISMISS = 3000

export default function LimitOrderPanel(props: {
  contract: MarketContract
  multiProps?: MultiBetProps
  user: User | null | undefined
  unfilledBets: LimitBet[]
  balanceByUserId: { [userId: string]: number }
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
  initialProb?: number
  expiration?: number
}) {
  const {
    contract,
    multiProps,
    unfilledBets,
    balanceByUserId,
    user,
    outcome,
    onBuySuccess,
    pseudonym,
    expiration,
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
  const initTimeInMs = Number(Date.now() + (expiration ?? 5 * MINUTE_MS))
  const initDate = dayjs(initTimeInMs).format('YYYY-MM-DD')
  const initTime = dayjs(initTimeInMs).format('HH:mm')
  const [expirationDate, setExpirationDate] = usePersistentLocalState<string>(
    initDate,
    'limit-order-expiration-date'
  )
  const [expirationHoursMinutes, setExpirationHoursMinutes] =
    usePersistentLocalState<string>(initTime, 'limit-order-expiration-time')

  const [selectedExpiration, setSelectedExpiration] =
    usePersistentLocalState<number>(0, 'limit-order-expiration')

  const [isSharing, setIsSharing] = useState(false)
  const [lastBetDetails, setLastBetDetails] = useState<Bet | null>(null)

  const callOnBuySuccess = useEvent(() => {
    if (onBuySuccess && !isSharing) {
      onBuySuccess()
    }
  })

  useEffect(() => {
    if (expiration === 0) {
      setSelectedExpiration(0)
    } else if (expiration) {
      const matchingOption = expirationOptions.find(
        (option) => option.value === expiration && option.value !== -1
      )
      if (matchingOption) {
        setSelectedExpiration(matchingOption.value)
      }
    }
  }, [expiration, setSelectedExpiration])

  const addCustomExpiration = selectedExpiration === -1
  const expiresAt = addCustomExpiration
    ? dayjs(`${expirationDate}T${expirationHoursMinutes}`).valueOf()
    : undefined

  const expiresMillisAfter =
    !addCustomExpiration && selectedExpiration > 0
      ? selectedExpiration
      : undefined

  const initialProb =
    props.initialProb ??
    (isBinaryMC && outcome === 'YES'
      ? multiProps!.answerToBuy.prob
      : isBinaryMC && outcome === 'NO'
      ? 1 - multiProps!.answerToBuy.prob
      : isCpmmMulti
      ? multiProps!.answerToBuy.prob
      : getProbability(contract))

  const [limitProbInt, setLimitProbInt] = useState<number | undefined>(
    Math.round(initialProb * 100)
  )

  const hasLimitBet = !!limitProbInt && !!betAmount

  const betDisabled =
    isSubmitting ||
    !outcome ||
    !betAmount ||
    !hasLimitBet ||
    error === 'Insufficient balance'

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

  async function submitBet() {
    if (!user || betDisabled) return

    setError(undefined)
    setIsSubmitting(true)

    const answerId = multiProps?.answerToBuy.id

    try {
      const bet = await api(
        'bet',
        removeUndefinedProps({
          outcome,
          amount,
          contractId: contract.id,
          answerId,
          limitProb,
          expiresAt: addCustomExpiration ? expiresAt : undefined,
          expiresMillisAfter,
          deps: betDeps.current?.map((b) => b.userId),
          silent: expiresMillisAfter && expiresMillisAfter <= 1000,
        } as APIParams<'bet'>)
      )
      console.log(`placed ${TRADE_TERM}. Result:`, bet)

      const fullBet: Bet = {
        ...(bet as CandidateBet<LimitBet>),
        id: bet.betId,
        userId: user.id,
      }
      track('bet', {
        location: 'bet panel',
        outcomeType: contract.outcomeType,
        slug: contract.slug,
        contractId: contract.id,
        amount,
        outcome,
        limitProb,
        isLimitOrder: true,
        answerId: multiProps?.answerToBuy.id,
        token: contract.token,
      })
      setLastBetDetails(fullBet)
      setIsSharing(false)
      setTimeout(() => {
        callOnBuySuccess()
      }, WAIT_TO_DISMISS)
    } catch (e) {
      setLastBetDetails(null)
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

  let currentPayout = 0
  let currentReturn = 0
  let orderAmount = 0
  let filledAmount = 0
  try {
    const result = getLimitBetReturns(
      outcome ?? 'YES',
      amount,
      unfilledBets,
      balanceByUserId,
      setError,
      contract,
      multiProps,
      limitProb,
      false
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

  const hideYesNo = isBinaryMC || !!pseudonym

  const expirationItems = expirationOptions.map((option) => ({
    name: option.label,
    onClick: () => setSelectedExpiration(option.value),
  }))

  return (
    <>
      <Col className=" gap-1">
        <Row className={'text-ink-600 items-center space-x-3'}>
          {capitalize(TRADE_TERM)} amount
        </Row>
        <BuyAmountInput
          parentClassName="max-w-full mt-1"
          amount={betAmount}
          onChange={onBetChange}
          error={error}
          setError={setError}
          disabled={isSubmitting}
          showSlider
          token={isCashContract ? 'CASH' : 'M$'}
          sliderColor={pseudonymColor}
        />
      </Col>
      <Col className="relative mt-6 w-full gap-1">
        <div className="text-ink-600">
          {isPseudoNumeric ? 'Value' : `Probability (%)`}
        </div>
        <Row>
          <label className="font-sm md:font-lg relative w-full">
            <Input
              type="number"
              min={0}
              max={100}
              step={1}
              className="h-[60px] w-full !text-xl"
              value={limitProbInt ?? ''}
              onChange={(e) => {
                const val =
                  e.target.value === '' ? undefined : Number(e.target.value)
                if (val === undefined || (val >= 0 && val <= 100)) {
                  setLimitProbInt(val)
                }
              }}
            />
            <Row className="absolute right-2 top-3.5 gap-1.5 sm:gap-2">
              <button
                className="hover:bg-ink-200 bg-canvas-100 rounded-md px-2 py-1.5 text-sm sm:px-3"
                onClick={() => {
                  if (limitProbInt !== undefined) {
                    setLimitProbInt(limitProbInt - 5)
                  }
                }}
              >
                -5
              </button>
              <button
                className="hover:bg-ink-200 bg-canvas-100 rounded-md px-2 py-1.5 text-sm sm:px-3"
                onClick={() => {
                  if (limitProbInt !== undefined) {
                    setLimitProbInt(limitProbInt - 1)
                  }
                }}
              >
                -1
              </button>
              <button
                className="hover:bg-ink-200 bg-canvas-100 rounded-md px-2 py-1.5 text-sm sm:px-3"
                onClick={() => {
                  if (limitProbInt !== undefined) {
                    setLimitProbInt(limitProbInt + 1)
                  }
                }}
              >
                +1
              </button>
              <button
                className="hover:bg-ink-200 bg-canvas-100 rounded-md px-2 py-1.5 text-sm sm:px-3"
                onClick={() => {
                  if (limitProbInt !== undefined) {
                    setLimitProbInt(limitProbInt + 5)
                  }
                }}
              >
                +5
              </button>
            </Row>
          </label>
        </Row>

        <ProbabilitySlider
          prob={limitProbInt}
          onProbChange={setLimitProbInt}
          disabled={isSubmitting}
          color={pseudonymColor}
          outcome={isBinaryMC ? 'YES' : outcome}
        />
      </Col>

      <Col className="mt-6 gap-2">
        <DropdownMenu
          buttonContent={
            <Row className="items-center gap-1">
              <span>
                {expirationOptions.find(
                  (opt) => opt.value === selectedExpiration
                )?.label ?? expirationOptions[0].label}
              </span>
              <SelectorIcon className="text-ink-400 h-4 w-4" />
            </Row>
          }
          closeOnClick
          items={expirationItems}
          buttonClass="text-ink-600 hover:text-ink-900 p-0 bg-transparent"
          menuWidth="w-48"
        />

        {addCustomExpiration && (
          <Col className="gap-2">
            <Row className="gap-2">
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
          </Col>
        )}
      </Col>

      <Col className="mt-2 w-full gap-2">
        {outcome && hasLimitBet && filledAmount > 0 && (
          <Row className="items-center justify-between gap-2 ">
            <div className="text-ink-600 whitespace-nowrap">
              {isPseudoNumeric ? (
                <PseudoNumericOutcomeLabel outcome={outcome} />
              ) : (
                !hideYesNo && <BinaryOutcomeLabel outcome={outcome} />
              )}{' '}
              {hideYesNo ? 'Filled' : 'filled'} now
            </div>
            <div className="whitespace-nowrap">
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
          <Row className="mb-2 items-center justify-between gap-2">
            <Row className="text-ink-600 flex-nowrap items-center gap-2 whitespace-nowrap">
              <div>
                {isPseudoNumeric ? (
                  'Shares'
                ) : (
                  <>
                    Max {!hideYesNo && <BinaryOutcomeLabel outcome={outcome} />}{' '}
                    payout
                    {isCashContract && (
                      <InfoTooltip
                        text="Manifold takes a 10% cut of profits on sweepstakes markets."
                        className="text-ink-600 ml-1 mt-0.5"
                        size="sm"
                      />
                    )}
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

        <Col className="gap-2">
          {user ? (
            <>
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
                    backgroundColor: binaryMCColors?.[outcome == 'YES' ? 0 : 1],
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
                      Buy{' '}
                      <MoneyDisplay
                        amount={betAmount}
                        isCashContract={isCashContract}
                      />{' '}
                      {!binaryMCOutcome && !pseudonymName ? outcome : ''} at{' '}
                      {formatPercent(
                        binaryMCOutcome || pseudonymName
                          ? preLimitProb ?? 0
                          : limitProb
                      )}
                    </span>
                  )}
                </Button>
              </Row>

              {lastBetDetails && (
                <Row className="bg-primary-100 mt-2 items-center justify-between rounded-lg p-3">
                  <Row className="items-baseline gap-2">
                    <span className="text-primary-700 text-sm ">
                      {isSubmitting ? 'Placing trade...' : 'Trade successful!'}
                    </span>
                  </Row>
                  <Button
                    className="w-1/2"
                    color="gradient"
                    onClick={() => setIsSharing(true)}
                  >
                    <Row className="items-center gap-1.5">
                      <LuShare className="h-5 w-5" aria-hidden />
                      Share Bet
                    </Row>
                  </Button>
                </Row>
              )}

              {lastBetDetails && isSharing && user && (
                <ShareBetModal
                  open={isSharing}
                  setOpen={setIsSharing}
                  questionText={contract.question}
                  outcome={formatOutcomeLabel(
                    contract,
                    lastBetDetails.outcome as 'YES' | 'NO'
                  )}
                  answer={multiProps?.answerToBuy.text}
                  avgPrice={formatPercent(lastBetDetails.limitProb ?? 0)}
                  betAmount={
                    lastBetDetails.orderAmount ?? lastBetDetails.amount
                  }
                  winAmount={
                    lastBetDetails.limitProb !== undefined &&
                    lastBetDetails.orderAmount !== undefined
                      ? lastBetDetails.outcome === 'YES'
                        ? lastBetDetails.orderAmount / lastBetDetails.limitProb
                        : lastBetDetails.orderAmount /
                          (1 - lastBetDetails.limitProb)
                      : lastBetDetails.shares
                  }
                  bettor={{
                    id: user.id,
                    name: user.name,
                    username: user.username,
                    avatarUrl: user.avatarUrl,
                  }}
                  isLimitBet={true}
                  orderAmount={lastBetDetails.orderAmount}
                />
              )}
            </>
          ) : (
            <Button
              color={outcome === 'NO' ? 'red' : 'green'}
              size="xl"
              onClick={withTracking(firebaseLogin, 'login from bet panel', {
                token: contract.token,
              })}
              className="mb-2 flex-grow"
            >
              Sign up to {TRADE_TERM}
            </Button>
          )}
        </Col>
      </Col>
    </>
  )
}
