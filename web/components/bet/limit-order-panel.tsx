import { SelectorIcon } from '@heroicons/react/solid'
import { useEvent } from 'client-common/hooks/use-event'
import { getLimitBetReturns, MultiBetProps } from 'client-common/lib/bet'
import clsx from 'clsx'
import { APIParams } from 'common/api/schema'
import { APIError } from 'common/api/utils'
import { Bet, LimitBet } from 'common/bet'
import { getProbability } from 'common/calculate'
import {
  getBinaryMCProb,
  isBinaryMulti,
  MarketContract,
  MultiContract,
} from 'common/contract'
import { TRADE_TERM } from 'common/envs/constants'
import { CandidateBet } from 'common/new-bet'
import { getPseudoProbability } from 'common/pseudo-numeric'
import { formatOutcomeLabel, formatPercent } from 'common/util/format'
import { removeUndefinedProps } from 'common/util/object'
import { DAY_MS, HOUR_MS, MINUTE_MS, MONTH_MS, WEEK_MS } from 'common/util/time'
import dayjs from 'dayjs'
import { capitalize, clamp } from 'lodash'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { LuShare } from 'react-icons/lu'
import { Input } from 'web/components/widgets/input'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { api } from 'web/lib/api/api'
import { firebaseLogin, User } from 'web/lib/firebase/users'
import { track, withTracking } from 'web/lib/service/analytics'
import { Button } from '../buttons/button'
import { getAnswerColor } from '../charts/contract/choice'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { BinaryOutcomeLabel, PseudoNumericOutcomeLabel } from '../outcome-label'
import { AmountInput, BuyAmountInput } from '../widgets/amount-input'
import DropdownMenu from '../widgets/dropdown-menu'
import { InfoTooltip } from '../widgets/info-tooltip'
import { ProbabilitySlider } from '../widgets/probability-input'
import { sliderColors } from '../widgets/slider'
import { MoneyDisplay } from './money-display'
import { ShareBetModal } from './share-bet'

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
  prefillTimestamp?: number
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

  // State for editing payout
  const [isEditingPayout, setIsEditingPayout] = useState(false)
  const [editablePayout, setEditablePayout] = useState<number | undefined>(
    undefined
  )

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
    // Include prefillTimestamp so clicking the same order again resets expiration
  }, [expiration, setSelectedExpiration, props.prefillTimestamp])

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

  // Track the last applied prefill timestamp to avoid re-applying or resetting
  const lastAppliedPrefillTimestamp = useRef<number | null>(null)

  // Update betAmount and limitProbInt when prefill props change (for prefill from order book)
  // Only apply when it's a NEW prefill (different timestamp), not when clearing
  useEffect(() => {
    const newAmount = props.betAmount
    const newProb = props.initialProb
    const newTimestamp = props.prefillTimestamp

    // Check if this is a new prefill (has timestamp and it's different from last applied)
    const isNewPrefill =
      newTimestamp !== undefined &&
      newTimestamp !== lastAppliedPrefillTimestamp.current

    if (isNewPrefill && newAmount !== undefined && newProb !== undefined) {
      setBetAmount(newAmount)
      setLimitProbInt(Math.round(newProb * 100))
      lastAppliedPrefillTimestamp.current = newTimestamp
    }
  }, [props.betAmount, props.initialProb, props.prefillTimestamp])

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

  const setLimitProbIntClamped = (val: number | undefined) => {
    if (val === undefined) {
      setLimitProbInt(undefined)
      return
    }
    if (isPseudoNumeric) {
      const minVal = contract.min
      const maxVal = contract.max
      setLimitProbInt(clamp(val, minVal, maxVal))
    } else {
      setLimitProbInt(clamp(val, 1, 99))
    }
  }

  const handlePayoutEdited = useEvent(() => {
    if (
      !outcome ||
      !limitProb ||
      !editablePayout ||
      isNaN(editablePayout) ||
      editablePayout <= 0
    ) {
      setIsEditingPayout(false)
      return
    }

    try {
      // For limit orders, the price is fixed at limitProb
      // For YES: amount = payout * limitProb
      // For NO: amount = payout * (1 - limitProb)
      const effectiveProb = outcome === 'YES' ? limitProb : 1 - limitProb
      const amount = Math.round(editablePayout * effectiveProb * 100) / 100

      if (amount && isFinite(amount) && amount > 0) {
        setBetAmount(amount)
        setError(undefined)
      } else {
        toast.error('Could not calculate bet for that payout amount')
      }
    } catch (err) {
      console.error('Error calculating bet amount from payout:', err)
      toast.error('Error calculating bet amount')
    } finally {
      setIsEditingPayout(false)
    }
  })

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
      if (expiresMillisAfter === 1) {
        toast.success('Order will expire immediately after placement')
      }
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
    if (result.calculationError && error !== result.calculationError) {
      setError(result.calculationError)
    }
  } catch (err: any) {
    console.error('Error in calculateCpmmMultiArbitrage:', err)
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
              min={isPseudoNumeric ? contract.min : 1}
              max={isPseudoNumeric ? contract.max : 99}
              step={1}
              className="h-[60px] w-full !text-xl"
              value={limitProbInt ?? ''}
              onChange={(e) => {
                const val =
                  e.target.value === '' ? undefined : Number(e.target.value)
                setLimitProbIntClamped(val)
              }}
            />
            <Row className="absolute right-2 top-3.5 gap-1.5 sm:gap-2">
              <button
                className="hover:bg-ink-200 bg-canvas-100 rounded-md px-2 py-1.5 text-sm sm:px-3"
                onClick={() => {
                  if (limitProbInt !== undefined) {
                    setLimitProbIntClamped(limitProbInt - 5)
                  }
                }}
              >
                -5
              </button>
              <button
                className="hover:bg-ink-200 bg-canvas-100 rounded-md px-2 py-1.5 text-sm sm:px-3"
                onClick={() => {
                  if (limitProbInt !== undefined) {
                    setLimitProbIntClamped(limitProbInt - 1)
                  }
                }}
              >
                -1
              </button>
              <button
                className="hover:bg-ink-200 bg-canvas-100 rounded-md px-2 py-1.5 text-sm sm:px-3"
                onClick={() => {
                  if (limitProbInt !== undefined) {
                    setLimitProbIntClamped(limitProbInt + 1)
                  }
                }}
              >
                +1
              </button>
              <button
                className="hover:bg-ink-200 bg-canvas-100 rounded-md px-2 py-1.5 text-sm sm:px-3"
                onClick={() => {
                  if (limitProbInt !== undefined) {
                    setLimitProbIntClamped(limitProbInt + 5)
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
          onProbChange={setLimitProbIntClamped}
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
                {isEditingPayout ? (
                  <AmountInput
                    inputClassName="w-32"
                    onBlur={handlePayoutEdited}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handlePayoutEdited()
                      } else if (e.key === 'Escape') {
                        setIsEditingPayout(false)
                      }
                    }}
                    autoFocus
                    min={1}
                    step={1}
                    amount={editablePayout}
                    onChangeAmount={setEditablePayout}
                  />
                ) : (
                  <span
                    className="cursor-pointer hover:underline"
                    onClick={() => {
                      setEditablePayout(Math.floor(currentPayout))
                      setIsEditingPayout(true)
                    }}
                  >
                    <MoneyDisplay
                      amount={currentPayout}
                      isCashContract={isCashContract}
                    />
                  </span>
                )}
              </span>
              {!isEditingPayout && <>({returnPercent})</>}
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
                <Row className="bg-canvas-50 border-ink-200 mt-2 items-center justify-between rounded-lg border px-3 py-2">
                  <Row className="items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-500/10">
                      <svg
                        className="h-3.5 w-3.5 text-teal-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                    <span className="text-ink-600 text-sm">
                      {isSubmitting ? 'Placing trade...' : 'Trade placed'}
                    </span>
                  </Row>
                  <button
                    className="text-primary-600 hover:text-primary-700 flex items-center gap-1.5 text-sm font-medium transition-colors"
                    onClick={() => setIsSharing(true)}
                  >
                    <LuShare className="h-4 w-4" aria-hidden />
                    Share
                  </button>
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
