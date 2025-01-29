import { ChevronDownIcon, XIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { uniq } from 'lodash'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

import {
  BinaryContract,
  CPMMMultiContract,
  CPMMNumericContract,
  isBinaryMulti,
  MAX_CPMM_PROB,
  MAX_STONK_PROB,
  MIN_CPMM_PROB,
  MIN_STONK_PROB,
  MultiContract,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import {
  formatLargeNumber,
  formatOutcomeLabel,
  formatPercent,
  formatWithToken,
} from 'common/util/format'
import { api, APIError } from 'web/lib/api/api'
import { firebaseLogin } from 'web/lib/firebase/users'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { BuyAmountInput } from '../widgets/amount-input'

import { Answer } from 'common/answer'
import { LimitBet } from 'common/bet'
import { getCpmmProbability } from 'common/calculate-cpmm'
import { SWEEPIES_NAME, TRADE_TERM } from 'common/envs/constants'
import {
  getVerificationStatus,
  PROMPT_USER_VERIFICATION_MESSAGES,
} from 'common/gidx/user'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { getStonkDisplayShares, STONK_NO, STONK_YES } from 'common/stonk'
import { getTierFromLiquidity } from 'common/tier'
import { floatingEqual } from 'common/util/math'
import { removeUndefinedProps } from 'common/util/object'
import { capitalize } from 'lodash'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { useUnfilledBetsAndBalanceByUserId } from 'web/hooks/use-bets'
import { useFocus } from 'web/hooks/use-focus'
import { useIsAdvancedTrader } from 'web/hooks/use-is-advanced-trader'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { track, withTracking } from 'web/lib/service/analytics'
import { isAndroid, isIOS } from 'web/lib/util/device'
import { Button } from '../buttons/button'
import { WarningConfirmationButton } from '../buttons/warning-confirmation-button'
import { getAnswerColor } from '../charts/contract/choice'
import { LocationMonitor } from '../gidx/location-monitor'
import { InBeta, VerifyButton } from '../sweeps/sweep-verify-section'
import { ChoicesToggleGroup } from '../widgets/choices-toggle-group'
import { CashoutLimitWarning } from './cashout-limit-warning'
import LimitOrderPanel, { getLimitBetReturns } from './limit-order-panel'
import { MoneyDisplay } from './money-display'
import { OrderBookPanel, YourOrders } from './order-book'
import { YesNoSelector } from './yes-no-selector'
import { sliderColors } from '../widgets/slider'
import { useContractBets } from 'client-common/hooks/use-bets'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { CandidateBet } from 'common/new-bet'
import { APIParams } from 'common/api/schema'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'

export type BinaryOutcomes = 'YES' | 'NO' | undefined

export type MultiBetProps = {
  answers: Answer[]
  answerToBuy: Answer
  answerText?: string
}
const SLIPPAGE = 0.1

export function BuyPanel(props: {
  contract:
    | BinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
    | CPMMNumericContract
  multiProps?: MultiBetProps
  inModal: boolean
  onBuySuccess?: () => void
  initialOutcome?: BinaryOutcomes
  location?: string
  replyToCommentId?: string
  alwaysShowOutcomeSwitcher?: boolean
  feedReason?: string
  children?: React.ReactNode
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
    initialOutcome,
    location = 'bet panel',
    inModal,
    alwaysShowOutcomeSwitcher,
    children,
    pseudonym,
  } = props

  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'
  const isStonk = contract.outcomeType === 'STONK'

  const [outcome, setOutcome] = useState<BinaryOutcomes>(initialOutcome)

  const [isPanelBodyVisible, setIsPanelBodyVisible] = useState(false)

  useEffect(() => {
    if (initialOutcome) {
      setOutcome(initialOutcome)
      setIsPanelBodyVisible(true)
    }
  }, [initialOutcome])

  function onOutcomeChoice(choice: 'YES' | 'NO') {
    if (outcome === choice && !initialOutcome) {
      setOutcome(undefined)
      setIsPanelBodyVisible(false)
    } else {
      track('bet intent', { location, option: outcome, token: contract.token })

      setOutcome(choice)
      setIsPanelBodyVisible(true)
    }
  }
  return (
    <Col>
      {!isPanelBodyVisible && (
        <Col>
          <Row className={clsx('mb-2 w-full items-center gap-2')}>
            <YesNoSelector
              className="flex-1"
              btnClassName="flex-1 px-2 sm:px-6"
              selected={outcome}
              highlight
              onSelect={(choice) => {
                onOutcomeChoice(choice)
              }}
              yesLabel={
                isPseudoNumeric ? 'HIGHER' : isStonk ? STONK_YES : 'YES'
              }
              noLabel={isPseudoNumeric ? 'LOWER' : isStonk ? STONK_NO : 'NO'}
              includeWordBet={!isStonk}
            />
          </Row>
        </Col>
      )}
      {isPanelBodyVisible && (
        <BuyPanelBody
          {...props}
          panelClassName={
            !!pseudonym
              ? 'bg-canvas-50'
              : outcome === 'NO'
              ? 'bg-scarlet-50'
              : outcome === 'YES'
              ? 'bg-teal-50'
              : ''
          }
          outcome={outcome}
          setOutcome={setOutcome}
          onClose={
            inModal || alwaysShowOutcomeSwitcher
              ? undefined
              : () => {
                  setIsPanelBodyVisible(false)
                  if (initialOutcome == undefined) {
                    setOutcome(undefined)
                  }
                }
          }
          pseudonym={pseudonym}
        >
          {children}
        </BuyPanelBody>
      )}
    </Col>
  )
}

export const BuyPanelBody = (props: {
  contract:
    | BinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
    | CPMMNumericContract
  multiProps?: MultiBetProps
  onBuySuccess?: () => void
  outcome?: BinaryOutcomes
  setOutcome: (outcome: 'YES' | 'NO') => void
  alwaysShowOutcomeSwitcher?: boolean
  location?: string
  onClose?: () => void
  replyToCommentId?: string
  feedReason?: string
  panelClassName?: string
  children?: React.ReactNode
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
}) => {
  const {
    contract,
    multiProps,
    outcome,
    setOutcome,
    alwaysShowOutcomeSwitcher,
    onBuySuccess,
    location = 'bet panel',
    onClose,
    replyToCommentId,
    feedReason,
    panelClassName,
    children,
  } = props

  const user = useUser()
  const privateUser = usePrivateUser()
  const marketTier =
    contract.marketTier ??
    getTierFromLiquidity(contract, contract.totalLiquidity)

  const { unfilledBets: allUnfilledBets, balanceByUserId } =
    useUnfilledBetsAndBalanceByUserId(contract.id)

  const unfilledBetsMatchingAnswer = allUnfilledBets.filter(
    (b) => b.answerId === multiProps?.answerToBuy?.id
  )

  const isBinaryMC = isBinaryMulti(contract)
  const binaryMCColors = isBinaryMC
    ? (contract as MultiContract).answers.map(getAnswerColor)
    : undefined

  const binaryMCOutcomeLabel =
    isBinaryMC && multiProps
      ? multiProps.answerText ?? multiProps.answerToBuy.text
      : undefined
  const isCashContract = contract.token === 'CASH'
  const initialBetAmount = isCashContract ? 1 : marketTier === 'play' ? 5 : 50

  const [betAmount, setBetAmount] = useState<number | undefined>(
    initialBetAmount
  )

  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submittedBet, setSubmittedBet] = useState<
    | (LimitBet & {
        expired: boolean
        toastId: string
      })
    | null
  >(null)

  const [inputRef, focusAmountInput] = useFocus()

  const isCpmmMulti = contract.mechanism === 'cpmm-multi-1'
  if (isCpmmMulti && !multiProps) {
    throw new Error('multiProps must be defined for cpmm-multi-1')
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
  const prob = getCpmmProbability(cpmmState.pool, cpmmState.p)
  const floatLimitProb = Math.max(
    MIN_CPMM_PROB,
    Math.min(
      MAX_CPMM_PROB,
      outcome === 'YES' ? prob + SLIPPAGE : prob - SLIPPAGE
    )
  )
  const limitProb = Math.round(floatLimitProb * 100) / 100
  const shouldAnswersSumToOne =
    'shouldAnswersSumToOne' in contract ? contract.shouldAnswersSumToOne : false

  const unfilledBets =
    isCpmmMulti && !shouldAnswersSumToOne
      ? unfilledBetsMatchingAnswer
      : allUnfilledBets

  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'
  const isStonk = contract.outcomeType === 'STONK'

  const handleBetTypeChange = (type: 'Market' | 'Limit') => {
    setBetType(type)
  }

  const limitBets = useContractBets(
    contract.id,
    removeUndefinedProps({
      userId: user?.id,
      enabled: !!user?.id,
      afterTime: contract?.lastBetTime ?? user?.lastBetTime,
    }),
    useIsPageVisible,
    (params) => api('bets', params)
  )
  const updatedBet = limitBets.find((b) => b.id === submittedBet?.id)
  useEffect(() => {
    if (!submittedBet) return
    if (
      updatedBet?.isFilled ||
      updatedBet?.isCancelled ||
      submittedBet.expired ||
      (updatedBet?.expiresAt && Date.now() > updatedBet.expiresAt)
    ) {
      const amountFilled = updatedBet?.amount ?? submittedBet.amount
      const sharesFilled = updatedBet?.shares ?? submittedBet.shares
      const orderAmount = updatedBet?.orderAmount ?? submittedBet.orderAmount
      toast.dismiss(submittedBet.toastId)
      toast.success(
        `${formatWithToken({
          amount: amountFilled,
          token: isCashContract ? 'CASH' : 'M$',
        })}/${formatWithToken({
          amount: orderAmount,
          token: isCashContract ? 'CASH' : 'M$',
        })} filled for ${formatWithToken({
          amount: sharesFilled,
          token: isCashContract ? 'CASH' : 'M$',
        })} on payout`,
        {
          duration: 5000,
        }
      )
      setSubmittedBet(null)
      setIsSubmitting(false)
      onBuySuccess?.()
    }
  }, [updatedBet, submittedBet])

  const isAdvancedTrader = useIsAdvancedTrader()

  const [betType, setBetType] = usePersistentInMemoryState<'Market' | 'Limit'>(
    'Market',
    'bet-type'
  )

  useEffect(() => {
    if (!isIOS() && !isAndroid()) {
      focusAmountInput()
    }
  }, [])

  function onBetChange(newAmount: number | undefined) {
    setBetAmount(newAmount)
  }

  const binaryMCOutcome =
    isBinaryMC && multiProps
      ? multiProps.answerText === multiProps.answerToBuy.text
        ? 'YES'
        : 'NO'
      : undefined
  const amount = betAmount ?? 0

  const {
    currentPayout,
    probAfter: newProbAfter,
    currentReturn,
    betDeps,
  } = getLimitBetReturns(
    cpmmState,
    binaryMCOutcome ?? outcome ?? 'YES',
    amount,
    limitProb,
    unfilledBets,
    balanceByUserId,
    setError,
    shouldAnswersSumToOne ? multiProps : undefined
  )
  let probBefore = prob
  let probAfter = newProbAfter
  if (
    multiProps &&
    multiProps.answerToBuy.text !== multiProps.answerText &&
    isBinaryMC
  ) {
    probBefore = 1 - prob
    probAfter = 1 - newProbAfter
  }

  async function submitBet() {
    if (!user || !betAmount) return
    console.log('betDeps', betDeps)
    setError(undefined)
    setIsSubmitting(true)
    const toastId = toast.loading(`Placing ${TRADE_TERM.toLowerCase()}...`)

    try {
      const expiresMillisAfter = 1000
      const bet = await api(
        'bet',
        removeUndefinedProps({
          outcome,
          amount: betAmount,
          contractId: contract.id,
          answerId: multiProps?.answerToBuy.id,
          replyToCommentId,
          deps: uniq(betDeps.map((b) => b.userId)),
          expiresMillisAfter,
          silent: true,
          limitProb,
        } as APIParams<'bet'>)
      )
      setBetAmount(undefined)
      setSubmittedBet({
        ...(bet as CandidateBet<LimitBet>),
        userId: user.id,
        id: bet.betId,
        expired: false,
        toastId,
      })
      setTimeout(() => {
        setSubmittedBet((prev) => (prev ? { ...prev, expired: true } : null))
      }, expiresMillisAfter + 100)

      track(
        'bet',
        removeUndefinedProps({
          location,
          outcomeType: contract.outcomeType,
          token: contract.token,
          slug: contract.slug,
          contractId: contract.id,
          amount: betAmount,
          betGroupId: bet.betGroupId,
          betId: bet.betId,
          outcome,
          isLimitOrder: false,
          answerId: multiProps?.answerToBuy.id,
          feedReason,
        })
      )
    } catch (e) {
      if (e instanceof APIError) {
        const message = e.message.toString()
        if (message.includes('could not serialize access')) {
          setError(`Error placing ${TRADE_TERM} (could not serialize access)`)
          console.error(`Error placing ${TRADE_TERM}`, e)
        } else setError(message)
        toast.error(`Error submitting ${TRADE_TERM}`)
      } else {
        console.error(e)
        setError(`Error placing ${TRADE_TERM}`)
        toast.error(`Error submitting ${TRADE_TERM}`)
      }
      toast.dismiss(toastId)
      setIsSubmitting(false)
    }
  }
  const [showLocationMonitor, setShowLocationMonitor] = useState(false)

  const { status: verificationStatus, message: verificationMessage } =
    getVerificationStatus(user, privateUser)

  const betDisabled =
    isSubmitting ||
    !betAmount ||
    outcome === undefined ||
    error === 'Insufficient balance' ||
    showLocationMonitor ||
    (isCashContract && verificationStatus !== 'success')

  const limits =
    contract.outcomeType === 'STONK'
      ? { max: MAX_STONK_PROB, min: MIN_STONK_PROB }
      : { max: MAX_CPMM_PROB, min: MIN_CPMM_PROB }
  const maxProb = limits.max
  const minProb = limits.min
  const probStayedSame = formatPercent(probAfter) === formatPercent(probBefore)
  const probChange = Math.abs(probAfter - probBefore)
  const currentReturnPercent = formatPercent(currentReturn)

  const displayedAfter = isPseudoNumeric
    ? formatLargeNumber(probAfter)
    : formatPercent(probAfter)

  const balance = isCashContract ? user?.cashBalance ?? 0 : user?.balance ?? 0

  const bankrollFraction = (betAmount ?? 0) / (balance ?? 1e9)

  // warnings
  const highBankrollSpend =
    (betAmount ?? 0) >= 100 && bankrollFraction >= 0.5 && bankrollFraction <= 1
  const highProbMove =
    (betAmount ?? 0) > 10 && probChange > 0.299 && bankrollFraction <= 1

  const warning = highBankrollSpend
    ? `You might not want to spend ${formatPercent(
        bankrollFraction
      )} of your balance on a single trade. \n\nCurrent balance: ${formatWithToken(
        {
          amount: balance,
          token: isCashContract ? 'CASH' : 'M$',
        }
      )}`
    : highProbMove
    ? `Are you sure you want to move the market to ${displayedAfter}?`
    : undefined

  const choicesMap: { [key: string]: string } = isStonk
    ? { Buy: 'YES', Short: 'NO' }
    : { Yes: 'YES', No: 'NO' }

  const { pseudonymName, pseudonymColor } =
    props.pseudonym?.[outcome as 'YES' | 'NO'] ?? {}

  const shouldPromptVerification =
    isCashContract &&
    PROMPT_USER_VERIFICATION_MESSAGES.includes(verificationMessage)

  return (
    <>
      <Col className={clsx(panelClassName, 'relative rounded-xl px-4 py-2')}>
        {isCashContract && <InBeta className="my-2" />}
        {children}
        {(isAdvancedTrader || alwaysShowOutcomeSwitcher) && (
          <Row className={'mb-2 mt-2 justify-between'}>
            <Row
              className={clsx(
                ' gap-1',
                (isBinaryMC || pseudonymName) && 'hidden'
              )}
            >
              <ChoicesToggleGroup
                currentChoice={outcome}
                color={outcome === 'YES' ? 'green' : 'red'}
                choicesMap={choicesMap}
                setChoice={(outcome) => {
                  setOutcome(outcome as 'YES' | 'NO')
                }}
              />
            </Row>
            <Row className="items-center justify-end gap-2">
              {isAdvancedTrader && !isStonk && (
                <ChoicesToggleGroup
                  currentChoice={betType}
                  color="light"
                  choicesMap={{
                    Quick: 'Market',
                    Limit: 'Limit',
                  }}
                  setChoice={(val) => {
                    handleBetTypeChange(val as 'Market' | 'Limit')
                  }}
                />
              )}
              {onClose && (
                <Button
                  color="gray-white"
                  size="sm"
                  onClick={onClose}
                  className="-mr-2"
                >
                  <XIcon className="h-5 w-5" />
                </Button>
              )}
            </Row>
          </Row>
        )}

        {betType === 'Market' ? (
          <>
            <Row className={clsx('text-ink-700 mb-2 items-center space-x-3')}>
              {capitalize(TRADE_TERM)} amount
            </Row>

            <Row
              className={clsx(
                'flex-wrap gap-x-8 gap-y-4',
                isAdvancedTrader ? 'items-center' : 'items-end',
                isAdvancedTrader ? 'mb-5' : 'mb-3'
              )}
            >
              <BuyAmountInput
                amount={betAmount}
                onChange={onBetChange}
                error={error}
                setError={setError}
                disabled={isSubmitting}
                inputRef={inputRef}
                showSlider={isAdvancedTrader}
                marketTier={marketTier}
                token={isCashContract ? 'CASH' : 'M$'}
                sliderColor={pseudonymColor}
                disregardUserBalance={shouldPromptVerification}
              />

              {isAdvancedTrader && (
                <Col className="gap-3">
                  <Row className=" items-baseline">
                    <span className="text-ink-700 mr-2 min-w-[120px] whitespace-nowrap">
                      {isPseudoNumeric
                        ? 'Estimated value'
                        : isStonk
                        ? 'New stock price'
                        : 'New probability'}
                    </span>
                    <span className="text-lg font-semibold">
                      {getFormattedMappedValue(
                        contract,
                        probStayedSame ? probBefore : probAfter
                      )}
                    </span>
                    {!probStayedSame && !isPseudoNumeric && (
                      <span className={clsx('ml-1', 'text-ink-700')}>
                        {outcome !== 'NO' || isBinaryMC ? '↑' : '↓'}
                        {getFormattedMappedValue(
                          contract,
                          Math.abs(probAfter - probBefore)
                        )}
                        {floatingEqual(probAfter, maxProb)
                          ? ' (max)'
                          : floatingEqual(probAfter, minProb)
                          ? ' (max)'
                          : ''}
                      </span>
                    )}
                  </Row>
                  <Row className="min-w-[128px] items-baseline">
                    <div className="text-ink-700 mr-2 min-w-[120px] flex-nowrap whitespace-nowrap">
                      {isPseudoNumeric || isStonk ? 'Shares' : <>Max payout</>}
                    </div>

                    <span className="mr-1 whitespace-nowrap text-lg">
                      {isStonk ? (
                        getStonkDisplayShares(contract, currentPayout, 2)
                      ) : isPseudoNumeric ? (
                        Math.floor(currentPayout)
                      ) : (
                        <MoneyDisplay
                          amount={currentPayout}
                          isCashContract={isCashContract}
                        />
                      )}
                    </span>
                    <span className="text-green-500 ">
                      {isStonk || isPseudoNumeric
                        ? ''
                        : ' +' + currentReturnPercent}
                    </span>
                  </Row>
                </Col>
              )}
            </Row>
          </>
        ) : (
          <>
            <LimitOrderPanel
              contract={contract}
              multiProps={multiProps}
              user={user}
              unfilledBets={unfilledBets}
              balanceByUserId={balanceByUserId}
              outcome={outcome}
              pseudonym={props.pseudonym}
              kycError={
                isCashContract && verificationStatus !== 'success'
                  ? verificationMessage
                  : undefined
              }
              shouldPromptVerification={shouldPromptVerification}
            />
          </>
        )}

        {betType !== 'Limit' && (
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
                  {isCashContract && verificationStatus !== 'success' && (
                    <div className="text-error">{verificationMessage}</div>
                  )}
                  <WarningConfirmationButton
                    marketType="binary"
                    amount={betAmount}
                    warning={warning}
                    userOptedOutOfWarning={user.optOutBetWarnings}
                    onSubmit={submitBet}
                    ButtonClassName={clsx('flex-grow')}
                    actionLabelClassName={'line-clamp-1'}
                    isSubmitting={isSubmitting}
                    disabled={betDisabled}
                    size="xl"
                    color={
                      pseudonymColor ??
                      binaryMCColors?.[outcome == 'YES' ? 0 : 1] ??
                      (outcome === 'NO' ? 'red' : 'green')
                    }
                    actionLabel={
                      betDisabled && !outcome ? (
                        `Select ${formatOutcomeLabel(
                          contract,
                          'YES'
                        )} or ${formatOutcomeLabel(contract, 'NO')}`
                      ) : isStonk ? (
                        <span>
                          {formatOutcomeLabel(contract, outcome, pseudonymName)}{' '}
                          <MoneyDisplay
                            amount={betAmount ?? 0}
                            isCashContract={isCashContract}
                          />
                        </span>
                      ) : (
                        <span>
                          {capitalize(TRADE_TERM)}{' '}
                          {binaryMCOutcomeLabel ??
                            formatOutcomeLabel(
                              contract,
                              outcome,
                              pseudonymName
                            )}{' '}
                          to win up to{' '}
                          <MoneyDisplay
                            amount={currentPayout}
                            isCashContract={isCashContract}
                          />
                        </span>
                      )
                    }
                    inModal={!!onClose}
                  />
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
        )}
        {isCashContract && <CashoutLimitWarning user={user} className="mt-2" />}

        {user && (
          <Row className="mt-5 items-start justify-between text-sm">
            <Row className={''}>
              <span
                className={clsx(
                  'text-ink-700 mr-1 whitespace-nowrap ',
                  isAdvancedTrader ? '' : 'min-w-[110px]'
                )}
              >
                Your {isCashContract ? SWEEPIES_NAME : 'mana'}
                {' balance'}
              </span>
              <span className="text-ink-700 font-semibold">
                <MoneyDisplay
                  amount={balance}
                  isCashContract={isCashContract}
                />
              </span>
            </Row>
          </Row>
        )}

        {!isAdvancedTrader && (
          <Col>
            <Row className="">
              <span className="text-ink-700 mr-1 min-w-[110px] whitespace-nowrap text-sm">
                {isPseudoNumeric
                  ? 'Estimated value'
                  : isStonk
                  ? 'New stock price'
                  : 'New probability'}
              </span>

              <span className="text-ink-700 text-sm font-semibold">
                {getFormattedMappedValue(
                  contract,
                  probStayedSame ? probBefore : probAfter
                )}
              </span>
              {!probStayedSame && !isPseudoNumeric && (
                <span className={clsx('ml-2 text-sm', 'text-ink-700')}>
                  {outcome !== 'NO' || isBinaryMC ? '↑' : '↓'}
                  {getFormattedMappedValue(
                    contract,
                    Math.abs(probAfter - probBefore)
                  )}
                  {floatingEqual(probAfter, maxProb)
                    ? ' (max)'
                    : floatingEqual(probAfter, minProb)
                    ? ' (max)'
                    : ''}{' '}
                </span>
              )}

              {!isPseudoNumeric && !isStonk && !isBinaryMC && (
                <InfoTooltip
                  text={`Your ${TRADE_TERM} will move the probability of Yes from ${getFormattedMappedValue(
                    contract,
                    probBefore
                  )} to ${getFormattedMappedValue(contract, probAfter)}.`}
                  className="text-ink-600 ml-1 mt-0.5"
                  size="sm"
                />
              )}

              {isBinaryMC && (
                <InfoTooltip
                  text={`Your ${TRADE_TERM} will move the probability from ${getFormattedMappedValue(
                    contract,
                    probBefore
                  )} to ${getFormattedMappedValue(contract, probAfter)}.`}
                  className="text-ink-600 ml-1 mt-0.5"
                  size="sm"
                />
              )}
            </Row>
          </Col>
        )}

        {/* {betType !== 'Limit' && (
          <div className="text-ink-700 mt-1 text-sm">
            Fees{' '}
            <FeeDisplay
              amount={betAmount}
              totalFees={fees}
              isCashContract={isCashContract}
            />
          </div>
        )} */}
        {/* <div className="text-ink-700 select-none text-sm">
          No fees
          <InfoTooltip
            text={`Now with no fees on ${TRADE_TERM}s, you keep more of your winnings!`}
            className="text-ink-600 ml-1 mt-0.5"
            size="sm"
          />
        </div> */}

        {user && (
          <div className="absolute bottom-2 right-0">
            <button
              className="text-ink-700 mr-2 flex items-center text-sm hover:underline"
              onClick={() => {
                if (!isAdvancedTrader) {
                  setBetType('Market')
                }
                api('me/update', { isAdvancedTrader: !isAdvancedTrader })
              }}
            >
              <span className="hover:underline">
                {isAdvancedTrader ? 'Basic' : 'Advanced'}
              </span>
              <ChevronDownIcon className="ml-1 h-3 w-3" />
            </button>
          </div>
        )}
      </Col>

      {contract.mechanism === 'cpmm-multi-1' && (
        <YourOrders
          className="mt-2 rounded-lg bg-indigo-200/10 py-4"
          contract={contract}
          bets={unfilledBetsMatchingAnswer}
        />
      )}
      {isAdvancedTrader && (
        <OrderBookPanel
          contract={contract}
          limitBets={unfilledBets.filter(
            (b) => b.answerId === multiProps?.answerToBuy?.id
          )}
          answer={multiProps?.answerToBuy}
          pseudonym={props.pseudonym}
        />
      )}
    </>
  )
}

export const QuickBetAmountsRow = (props: {
  onAmountChange: (amount: number) => void
  betAmount: number | undefined
  className?: string
}) => {
  const { onAmountChange, betAmount, className } = props
  const QUICK_BET_AMOUNTS = [10, 25, 100]
  return (
    <Row className={clsx('mb-2 items-center space-x-3', className)}>
      <div className="text-ink-700">Amount</div>
      <ChoicesToggleGroup
        currentChoice={
          QUICK_BET_AMOUNTS.includes(betAmount ?? 0) ? betAmount : undefined
        }
        choicesMap={QUICK_BET_AMOUNTS.reduce<{
          [key: number]: number
        }>((map, amount) => {
          map[amount] = amount
          return map
        }, {})}
        setChoice={(amount) => {
          if (typeof amount === 'number') {
            onAmountChange(amount)
          }
        }}
      />
    </Row>
  )
}
