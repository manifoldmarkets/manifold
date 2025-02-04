import dayjs from 'dayjs'
import { capitalize, clamp } from 'lodash'
import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { LimitBet } from 'common/bet'
import { getProbability } from 'common/calculate'
import {
  BinaryContract,
  CPMMMultiContract,
  CPMMNumericContract,
  getBinaryMCProb,
  isBinaryMulti,
  MultiContract,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
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
import { track, withTracking } from 'web/lib/service/analytics'
import { APIError } from 'common/api/utils'
import { removeUndefinedProps } from 'common/util/object'
import { api } from 'web/lib/api/api'
import clsx from 'clsx'
import { getAnswerColor } from '../charts/contract/choice'
import { MoneyDisplay } from './money-display'
import { TRADE_TERM } from 'common/envs/constants'
import { LocationMonitor } from '../gidx/location-monitor'
import { VerifyButton } from '../sweeps/sweep-verify-section'
import { sliderColors } from '../widgets/slider'
import { ProbabilitySlider } from '../widgets/probability-input'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { APIParams } from 'common/api/schema'
import { getLimitBetReturns, MultiBetProps } from 'client-common/lib/bet'
import DropdownMenu from '../widgets/dropdown-menu'
import { SelectorIcon } from '@heroicons/react/solid'

const expirationOptions = [
  { label: 'Never expires', value: 0 },
  { label: 'Expires in 1 hour', value: HOUR_MS },
  { label: 'Expires in 1 day', value: DAY_MS },
  { label: 'Expires in 1 week', value: WEEK_MS },
  { label: 'Expires in 1 month', value: MONTH_MS },
  { label: 'Custom time...', value: -1 },
]

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
  const initTimeInMs = Number(Date.now() + 5 * MINUTE_MS)
  const initDate = dayjs(initTimeInMs).format('YYYY-MM-DD')
  const initTime = dayjs(initTimeInMs).format('HH:mm')
  const [expirationDate, setExpirationDate] = usePersistentLocalState<string>(
    initDate,
    'limit-order-expiration-date'
  )
  const [expirationHoursMinutes, setExpirationHoursMinutes] =
    usePersistentLocalState<string>(initTime, 'limit-order-expiration-time')

  // add to local storage
  const [selectedExpiration, setSelectedExpiration] =
    usePersistentLocalState<number>(0, 'limit-order-expiration')
  const addCustomExpiration = selectedExpiration === -1
  const expiresAt = addCustomExpiration
    ? dayjs(`${expirationDate}T${expirationHoursMinutes}`).valueOf()
    : undefined

  const expiresMillisAfter =
    !addCustomExpiration && selectedExpiration > 0
      ? selectedExpiration
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
            limitProb,
            expiresAt: addCustomExpiration ? expiresAt : undefined,
            expiresMillisAfter,
            deps: betDeps.current?.map((b) => b.userId),
            silent: expiresMillisAfter && expiresMillisAfter <= 1000,
          } as APIParams<'bet'>)
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

  let currentPayout = 0
  let currentReturn = 0
  let orderAmount = 0
  let filledAmount = 0
  // let fees = noFees
  try {
    const result = getLimitBetReturns(
      outcome ?? 'YES',
      amount,
      unfilledBets,
      balanceByUserId,
      setError,
      contract,
      multiProps,
      limitProb
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
          disregardUserBalance={shouldPromptVerification}
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
                className="hover:bg-ink-200 bg-canvas-100 rounded-md px-2 sm:px-3 py-1.5 text-sm"
                onClick={() => {
                  if (limitProbInt !== undefined) {
                    setLimitProbInt(limitProbInt - 5)
                  }
                }}
              >
                -5
              </button>
              <button
                className="hover:bg-ink-200 bg-canvas-100 rounded-md px-2 sm:px-3 py-1.5 text-sm"
                onClick={() => {
                  if (limitProbInt !== undefined) {
                    setLimitProbInt(limitProbInt - 1)
                  }
                }}
              >
                -1
              </button>
              <button
                className="hover:bg-ink-200 bg-canvas-100 rounded-md px-2 sm:px-3 py-1.5 text-sm"
                onClick={() => {
                  if (limitProbInt !== undefined) {
                    setLimitProbInt(limitProbInt + 1)
                  }
                }}
              >
                +1
              </button>
              <button
                className="hover:bg-ink-200 bg-canvas-100 rounded-md px-2 sm:px-3 py-1.5 text-sm"
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
                )?.label ?? 'Select expiration'}
              </span>
              <SelectorIcon className="text-ink-400 h-4 w-4" />
            </Row>
          }
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
