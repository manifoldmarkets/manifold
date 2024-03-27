import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { sumBy } from 'lodash'
import toast from 'react-hot-toast'
import { CheckIcon } from '@heroicons/react/solid'
import { ChevronDownIcon, XIcon } from '@heroicons/react/outline'

import {
  CPMMBinaryContract,
  CPMMMultiContract,
  CPMMNumericContract,
  isBinaryMulti,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import {
  formatLargeNumber,
  formatMoney,
  formatOutcomeLabel,
  formatPercent,
} from 'common/util/format'
import { computeCpmmBet } from 'common/new-bet'
import { firebaseLogin, updateUser } from 'web/lib/firebase/users'
import { LimitBet } from 'common/bet'
import { APIError, api } from 'web/lib/firebase/api'
import { BuyAmountInput } from '../widgets/amount-input'

import { useFocus } from 'web/hooks/use-focus'
import { useUnfilledBetsAndBalanceByUserId } from 'web/hooks/use-bets'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { OrderBookPanel, YourOrders } from './order-book'
import { track, withTracking } from 'web/lib/service/analytics'
import { YesNoSelector } from './yes-no-selector'
import { isAndroid, isIOS } from 'web/lib/util/device'
import { WarningConfirmationButton } from '../buttons/warning-confirmation-button'
import { Button } from '../buttons/button'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { getStonkDisplayShares, STONK_NO, STONK_YES } from 'common/stonk'
import { Answer } from 'common/answer'
import { getCpmmProbability } from 'common/calculate-cpmm'
import { removeUndefinedProps } from 'common/util/object'
import { calculateCpmmMultiArbitrageBet } from 'common/calculate-cpmm-arbitrage'
import LimitOrderPanel from './limit-order-panel'
import { useIsAdvancedTrader } from 'web/hooks/use-is-advanced-trader'
import { ChoicesToggleGroup } from '../widgets/choices-toggle-group'
import { FeedTimelineItem } from 'web/hooks/use-feed-timeline'
import { useUser } from 'web/hooks/use-user'
import { getVersusColors } from '../charts/contract/choice'

export type BinaryOutcomes = 'YES' | 'NO' | undefined

export type MultiBetProps = {
  answers: Answer[]
  answerToBuy: Answer
  answerText?: string
}

export function BuyPanel(props: {
  contract:
    | CPMMBinaryContract
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
  feedItem?: FeedTimelineItem
  children?: React.ReactNode
}) {
  const {
    contract,
    initialOutcome,
    location = 'bet panel',
    inModal,
    alwaysShowOutcomeSwitcher,
    children,
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
      track('bet intent', { location, option: outcome })
      setOutcome(choice)
      setIsPanelBodyVisible(true)
    }
  }

  return (
    <Col>
      {(!isPanelBodyVisible || alwaysShowOutcomeSwitcher) && (
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
              isPseudoNumeric ? 'Bet HIGHER' : isStonk ? STONK_YES : 'Bet YES'
            }
            noLabel={
              isPseudoNumeric ? 'Bet LOWER' : isStonk ? STONK_NO : 'Bet NO'
            }
          />
        </Row>
      )}
      {isPanelBodyVisible && (
        <BuyPanelBody
          {...props}
          panelClassName={
            outcome === 'NO'
              ? 'bg-scarlet-50'
              : outcome === 'YES'
              ? 'bg-teal-50'
              : ''
          }
          outcome={outcome}
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
        >
          {children}
        </BuyPanelBody>
      )}
    </Col>
  )
}

export const BuyPanelBody = (props: {
  contract:
    | CPMMBinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
    | CPMMNumericContract
  multiProps?: MultiBetProps
  onBuySuccess?: () => void
  outcome?: BinaryOutcomes
  location?: string
  onClose?: () => void
  replyToCommentId?: string
  feedItem?: FeedTimelineItem
  panelClassName?: string
  children?: React.ReactNode
}) => {
  const {
    contract,
    multiProps,
    onBuySuccess,
    outcome,
    location = 'bet panel',
    onClose,
    replyToCommentId,
    feedItem,
    panelClassName,
    children,
  } = props

  const user = useUser()

  const { unfilledBets: allUnfilledBets, balanceByUserId } =
    useUnfilledBetsAndBalanceByUserId(contract.id)

  const unfilledBetsMatchingAnswer = allUnfilledBets.filter(
    (b) => b.answerId === multiProps?.answerToBuy?.id
  )

  const isBinaryMC = isBinaryMulti(contract)
  const binaryMCColors = isBinaryMC
    ? getVersusColors((contract as any).answers)
    : undefined

  const binaryMCOutcomeLabel =
    isBinaryMC && multiProps
      ? multiProps.answerText ?? multiProps.answerToBuy.text
      : undefined
  const initialBetAmount = 10
  const [betAmount, setBetAmount] = useState<number | undefined>(
    initialBetAmount
  )

  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [inputRef, focusAmountInput] = useFocus()

  const isCpmmMulti = contract.mechanism === 'cpmm-multi-1'
  if (isCpmmMulti && !multiProps) {
    throw new Error('multiProps must be defined for cpmm-multi-1')
  }
  const shouldAnswersSumToOne =
    'shouldAnswersSumToOne' in contract ? contract.shouldAnswersSumToOne : false

  const unfilledBets =
    isCpmmMulti && !shouldAnswersSumToOne
      ? // Always filter to answer for non-sum-to-one cpmm multi
        unfilledBetsMatchingAnswer
      : allUnfilledBets

  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'
  const isStonk = contract.outcomeType === 'STONK'

  const handleBetTypeChange = (type: 'Market' | 'Limit') => {
    setBetType(type)
  }

  const isAdvancedTrader = useIsAdvancedTrader()
  const [advancedTraderMode, setAdvancedTraderMode] = useState(false)

  const [betType, setBetType] = useState<'Market' | 'Limit'>('Market')

  useEffect(() => {
    if (user) {
      setAdvancedTraderMode(user.isAdvancedTrader ?? false)
    }
  }, [user])

  useEffect(() => {
    if (!isIOS() && !isAndroid()) {
      focusAmountInput()
    }
  }, [])

  function onBetChange(newAmount: number | undefined) {
    setBetAmount(newAmount)
  }

  async function submitBet() {
    if (!user || !betAmount) return

    setError(undefined)
    setIsSubmitting(true)

    const bet = await api(
      'bet',
      removeUndefinedProps({
        outcome,
        amount: betAmount,
        contractId: contract.id,
        answerId: multiProps?.answerToBuy.id,
        replyToCommentId,
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
        return r
      })
      .catch((e) => {
        if (e instanceof APIError) {
          const message = e.message.toString()
          if (message.includes('cross-transaction contention')) {
            setError('Error placing bet')
            console.error('Error placing bet', e)
          } else setError(message)
        } else {
          console.error(e)
          setError('Error placing bet')
        }
        setIsSubmitting(false)
        return undefined
      })

    track(
      'bet',
      removeUndefinedProps({
        location,
        outcomeType: contract.outcomeType,
        slug: contract.slug,
        contractId: contract.id,
        amount: betAmount,
        betGroupId: bet?.betGroupId,
        betId: bet?.betId,
        outcome,
        isLimitOrder: false,
        answerId: multiProps?.answerToBuy.id,
        feedItem,
      })
    )
  }
  const betDisabled =
    isSubmitting || !betAmount || !!error || outcome === undefined

  let currentPayout: number
  let probBefore: number
  let probAfter: number
  if (isCpmmMulti && multiProps && contract.shouldAnswersSumToOne) {
    const { answers, answerToBuy } = multiProps
    const { newBetResult } = calculateCpmmMultiArbitrageBet(
      answers,
      answerToBuy,
      outcome ?? 'YES',
      betAmount ?? 0,
      undefined,
      unfilledBets,
      balanceByUserId
    )
    const { pool, p } = newBetResult.cpmmState
    currentPayout = sumBy(newBetResult.takers, 'shares')
    if (multiProps.answerToBuy.text !== multiProps.answerText && isBinaryMC) {
      probBefore = 1 - answerToBuy.prob
      probAfter = 1 - getCpmmProbability(pool, p)
    } else {
      probBefore = answerToBuy.prob
      probAfter = getCpmmProbability(pool, p)
    }
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

  const displayedAfter = isPseudoNumeric
    ? formatLargeNumber(probAfter)
    : formatPercent(probAfter)

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
    ? `Are you sure you want to move the market to ${displayedAfter}?`
    : undefined

  return (
    <>
      <Col className={clsx(panelClassName, 'relative rounded-xl px-4 py-2')}>
        {children}
        {isAdvancedTrader && !isStonk && (
          <Row className="mb-2 items-center space-x-3">
            <div className="text-ink-700">Bet type</div>
            <ChoicesToggleGroup
              currentChoice={betType}
              choicesMap={{
                Market: 'Market',
                Limit: 'Limit',
              }}
              setChoice={(val) => {
                if (val === 'Market' || val === 'Limit') {
                  handleBetTypeChange(val)
                }
              }}
            />
          </Row>
        )}
        {onClose && (
          <Button
            color="gray-white"
            className="absolute right-1 top-1"
            onClick={onClose}
          >
            <XIcon className="h-5 w-5" />
          </Button>
        )}
        {betType === 'Market' ? (
          <>
            <Row className={clsx('text-ink-700 mb-2 items-center space-x-3')}>
              Bet amount
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
                binaryOutcome={isBinaryMC ? undefined : outcome}
                showSlider={isAdvancedTrader}
              />

              {isAdvancedTrader && (
                <Col className="gap-3">
                  <div className="flex-grow">
                    <span className="text-ink-700 mr-2 whitespace-nowrap">
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
                      </span>
                    )}
                  </div>
                  <Row className="min-w-[128px] items-baseline">
                    <div className="text-ink-700 mr-2 flex-nowrap whitespace-nowrap">
                      {isPseudoNumeric || isStonk ? 'Shares' : <>Max payout</>}
                    </div>
                    <span className="mr-1 whitespace-nowrap text-lg">
                      {isStonk
                        ? getStonkDisplayShares(contract, currentPayout, 2)
                        : isPseudoNumeric
                        ? Math.floor(currentPayout)
                        : formatMoney(currentPayout)}
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
            />
          </>
        )}

        {betType !== 'Limit' && (
          <Col className="gap-2">
            {user ? (
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
                  binaryMCColors?.[outcome == 'YES' ? 0 : 1] ??
                  (outcome === 'NO' ? 'red' : 'green')
                }
                actionLabel={
                  betDisabled
                    ? `Select ${formatOutcomeLabel(
                        contract,
                        'YES'
                      )} or ${formatOutcomeLabel(contract, 'NO')}`
                    : isStonk
                    ? formatOutcomeLabel(contract, outcome)
                    : `Bet ${
                        binaryMCOutcomeLabel ??
                        formatOutcomeLabel(contract, outcome)
                      } to win ${formatMoney(currentPayout)}`
                }
                inModal={!!onClose}
              />
            ) : (
              <Button
                color={outcome === 'NO' ? 'red' : 'green'}
                size="xl"
                onClick={withTracking(firebaseLogin, 'login from bet panel')}
                className="flex-grow"
              >
                Sign up to predict
              </Button>
            )}
          </Col>
        )}

        {user ? (
          <Row className="mt-3 items-start justify-between">
            <div className="flex-grow">
              <span className="text-ink-700 mt-4 whitespace-nowrap text-sm">
                Your balance{' '}
                <span className="text-ink-700 font-semibold">
                  {formatMoney(user.balance)}
                </span>
              </span>
            </div>

            {isAdvancedTrader && (
              <div>
                <button
                  className="text-ink-700 mr-2 flex items-center text-sm hover:underline"
                  onClick={() => {
                    const tradingMode = !advancedTraderMode
                    setAdvancedTraderMode(tradingMode)
                    if (!tradingMode) {
                      setBetType('Market')
                    }
                    updateUser(user.id, { isAdvancedTrader: tradingMode })
                  }}
                >
                  <span className="hover:underline">
                    {advancedTraderMode ? 'Default' : 'Advanced'}
                  </span>
                  <ChevronDownIcon className="ml-1 h-3 w-3" />
                </button>
              </div>
            )}
          </Row>
        ) : null}

        {!isAdvancedTrader && (
          <Row className=" items-start justify-between">
            <div className=" flex-grow">
              <span className="text-ink-700 mr-1 whitespace-nowrap text-sm">
                {isPseudoNumeric
                  ? 'Estimated value'
                  : isStonk
                  ? 'New stock price'
                  : 'New probability'}
              </span>

              <span className="text-sm font-semibold">
                {getFormattedMappedValue(
                  contract,
                  probStayedSame ? probBefore : probAfter
                )}
              </span>
              {!probStayedSame && !isPseudoNumeric && (
                <span className={clsx('ml-1 text-sm', 'text-ink-700')}>
                  {outcome !== 'NO' || isBinaryMC ? '↑' : '↓'}
                  {getFormattedMappedValue(
                    contract,
                    Math.abs(probAfter - probBefore)
                  )}
                </span>
              )}

              {!isPseudoNumeric && !isStonk && !isBinaryMC && (
                <InfoTooltip
                  text={`Your bet will move the probability of Yes from ${getFormattedMappedValue(
                    contract,
                    probBefore
                  )} to ${getFormattedMappedValue(contract, probAfter)}.`}
                  className="text-ink-600 ml-1 mt-0.5"
                  size="sm"
                />
              )}

              {isBinaryMC && (
                <InfoTooltip
                  text={`Your bet will move the probability from ${getFormattedMappedValue(
                    contract,
                    probBefore
                  )} to ${getFormattedMappedValue(contract, probAfter)}.`}
                  className="text-ink-600 ml-1 mt-0.5"
                  size="sm"
                />
              )}
            </div>

            {user && (
              <div>
                <button
                  className="text-ink-700 mr-2 flex items-center text-sm hover:underline"
                  onClick={() => {
                    const tradingMode = !advancedTraderMode
                    setAdvancedTraderMode(tradingMode)
                    if (!tradingMode) {
                      setBetType('Market')
                    }
                    updateUser(user.id, { isAdvancedTrader: tradingMode })
                  }}
                >
                  <span className="hover:underline">
                    {advancedTraderMode ? 'Default' : 'Advanced'}
                  </span>
                  <ChevronDownIcon className="ml-1 h-3 w-3" />
                </button>
              </div>
            )}
          </Row>
        )}
      </Col>

      <YourOrders
        className="mt-2 rounded-lg bg-indigo-200/10 py-4"
        contract={contract}
        bets={unfilledBetsMatchingAnswer}
      />
      {/* Stonks don't allow limit orders but users may have them from before the conversion */}
      {isStonk && unfilledBets.length > 0 && (
        <YourOrders
          className="mt-2 rounded-lg bg-indigo-200/10 px-4 py-4"
          contract={contract}
          bets={unfilledBets as LimitBet[]}
        />
      )}
      {advancedTraderMode && (
        <OrderBookPanel
          contract={contract}
          limitBets={unfilledBets.filter(
            (b) => b.answerId === multiProps?.answerToBuy?.id
          )}
          answer={multiProps?.answerToBuy}
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
