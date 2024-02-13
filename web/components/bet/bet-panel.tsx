import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { sumBy } from 'lodash'
import toast from 'react-hot-toast'
import { CheckIcon } from '@heroicons/react/solid'

import {
  CPMMBinaryContract,
  CPMMMultiContract,
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
import { User, firebaseLogin, updateUser } from 'web/lib/firebase/users'
import { LimitBet } from 'common/bet'
import { APIError, api } from 'web/lib/firebase/api'
import { BuyAmountInput } from '../widgets/amount-input'

import { useFocus } from 'web/hooks/use-focus'
import { useUnfilledBetsAndBalanceByUserId } from 'web/hooks/use-bets'
import { getFormattedMappedValue, getMappedValue } from 'common/pseudo-numeric'
import { YourOrders } from './order-book'
import { track, withTracking } from 'web/lib/service/analytics'
import { YesNoSelector } from './yes-no-selector'
import { isAndroid, isIOS } from 'web/lib/util/device'
import { WarningConfirmationButton } from '../buttons/warning-confirmation-button'
import { Button } from '../buttons/button'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { SINGULAR_BET } from 'common/user'
import { getStonkDisplayShares, STONK_NO, STONK_YES } from 'common/stonk'
import { Answer } from 'common/answer'
import { getCpmmProbability } from 'common/calculate-cpmm'
import { removeUndefinedProps } from 'common/util/object'
import { calculateCpmmMultiArbitrageBet } from 'common/calculate-cpmm-arbitrage'
import LimitOrderPanel from './limit-order-panel'
import { useIsAdvancedTrader } from 'web/hooks/use-is-advanced-trader'
import ShortToggle from '../widgets/short-toggle'
import { ChevronDownIcon } from '@heroicons/react/outline'

export type BinaryOutcomes = 'YES' | 'NO' | undefined

export function BuyPanel(props: {
  contract:
    | CPMMBinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
  multiProps?: { answers: Answer[]; answerToBuy: Answer }
  user: User | null | undefined
  inModal: boolean
  onBuySuccess?: () => void
  singularView?: 'YES' | 'NO' | 'LIMIT'
  initialOutcome?: BinaryOutcomes | 'LIMIT'
  location?: string
  replyToCommentId?: string
}) {
  const {
    contract,
    multiProps,
    user,
    onBuySuccess,
    singularView,
    initialOutcome,
    location = 'bet panel',
    inModal,
    replyToCommentId,
  } = props

  const isCpmmMulti = contract.mechanism === 'cpmm-multi-1'
  if (isCpmmMulti && !multiProps) {
    throw new Error('multiProps must be defined for cpmm-multi-1')
  }
  const shouldAnswersSumToOne =
    'shouldAnswersSumToOne' in contract ? contract.shouldAnswersSumToOne : false

  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'
  const isStonk = contract.outcomeType === 'STONK'
  const [option, setOption] = useState<BinaryOutcomes | 'LIMIT'>(initialOutcome)
  const { unfilledBets: allUnfilledBets, balanceByUserId } =
    useUnfilledBetsAndBalanceByUserId(contract.id)

  const unfilledBetsMatchingAnswer = allUnfilledBets.filter(
    (b) => b.answerId === multiProps?.answerToBuy?.id
  )
  const unfilledBets =
    isCpmmMulti && !shouldAnswersSumToOne
      ? // Always filter to answer for non-sum-to-one cpmm multi
        unfilledBetsMatchingAnswer
      : allUnfilledBets

  const outcome = option === 'LIMIT' ? undefined : option
  const seeLimit = option === 'LIMIT'

  const [betAmount, setBetAmount] = useState<number | undefined>(10)
  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [inputRef, focusAmountInput] = useFocus()

  const [isYesNoSelectorVisible, setIsYesNoSelectorVisible] = useState(true)

  const isAdvancedTrader = useIsAdvancedTrader()
  const [advancedTraderMode, setAdvancedTraderMode] = useState(false)

  const [betType, setBetType] = useState<'Market' | 'Limit'>('Market')

  const handleBetTypeChange = (type: 'Market' | 'Limit') => {
    setBetType(type)
  }

  useEffect(() => {
    if (initialOutcome) {
      setOption(initialOutcome)
    }
  }, [initialOutcome])

  function onOptionChoice(choice: 'YES' | 'NO') {
    if (option === choice && !initialOutcome) {
      setOption(undefined)
      setIsYesNoSelectorVisible(true)
    } else {
      track('bet intent', { location, option })
      setOption(choice)
      setIsYesNoSelectorVisible(false)
    }
    if (!isIOS() && !isAndroid()) {
      focusAmountInput()
    }
  }

  useEffect(() => {
    if (user) {
      setAdvancedTraderMode(user.isAdvancedTrader ?? false)
    }
  }, [user])

  if (!user) {
    return null
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
    api(
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
      })
      .catch((e) => {
        if (e instanceof APIError) {
          setError(e.message.toString())
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
    ? `Are you sure you want to move the probability by ${displayedDifference}?`
    : undefined

  const selected = seeLimit ? 'LIMIT' : outcome

  return (
    <Col>
      {isYesNoSelectorVisible ? (
        <Row
          className={clsx(
            'mb-2 w-full items-center gap-2',
            singularView ? 'hidden' : ''
          )}
        >
          <YesNoSelector
            className="flex-1"
            btnClassName="flex-1 px-2 sm:px-6"
            selected={selected}
            highlight
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
        </Row>
      ) : (
        <Col
          className={clsx(
            !singularView
              ? outcome === 'NO'
                ? 'bg-scarlet-50'
                : outcome === 'YES'
                ? 'bg-teal-50'
                : 'hidden'
              : '',
            'rounded-xl',
            singularView ? '' : ' px-4 py-2',
            singularView && option === 'LIMIT' ? 'hidden' : ''
          )}
        >
          {isAdvancedTrader && (
            <Row className=" mb-2 space-x-1">
              <div className="text-ink-700 mb-1 mr-2 mt-2 ">Bet Type</div>
              <Button
                color={betType === 'Market' ? 'indigo' : 'indigo-outline'}
                onClick={() => handleBetTypeChange('Market')}
              >
                Market
              </Button>
              <Button
                color={betType === 'Limit' ? 'indigo' : 'indigo-outline'}
                onClick={() => handleBetTypeChange('Limit')}
              >
                Limit
              </Button>
            </Row>
          )}
          {betType === 'Market' ? (
            <>
              <Row
                className={clsx(
                  'mb-6 flex-wrap gap-x-8 gap-y-4',
                  isAdvancedTrader ? 'items-center' : 'items-end'
                )}
              >
                <BuyAmountInput
                  amount={betAmount}
                  onChange={onBetChange}
                  error={error}
                  setError={setError}
                  disabled={isSubmitting}
                  inputRef={inputRef}
                  binaryOutcome={outcome}
                  showSlider={isAdvancedTrader}
                />

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
                setOutcome={onOptionChoice}
              />
              <YourOrders
                className="mt-2 rounded-lg bg-indigo-400/10 px-4 py-2"
                contract={contract}
                bets={unfilledBetsMatchingAnswer}
              />
              {/* Stonks don't allow limit orders but users may have them from before the conversion */}
              {isStonk && unfilledBets.length > 0 && (
                <YourOrders
                  className="mt-2 rounded-lg bg-indigo-400/10 px-4 py-2"
                  contract={contract}
                  bets={unfilledBets as LimitBet[]}
                />
              )}
            </>
          )}
          <Row className="items-center justify-between gap-2">
            <Button
              color="gray"
              size="xl"
              className="text-white"
              onClick={() => {
                setIsYesNoSelectorVisible(true)
                setOption(undefined)
                setBetAmount(undefined)
              }}
            >
              Cancel
            </Button>
            {user ? (
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
                    : `Bet ${outcome}`
                }
                inModal={inModal}
                openModalButtonClass="flex-grow"
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
          </Row>
          {user ? (
            <div className="text-ink-700 mt-4 whitespace-nowrap text-sm">
              Balance{' '}
              <span className="text-ink-700 font-semibold">
                {formatMoney(user.balance)}
              </span>
            </div>
          ) : null}
          <Row className=" items-start justify-between">
            <div className="aksdjflkfs flex-grow">
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
                  {outcome !== 'NO' ? '↑' : '↓'}
                  {getFormattedMappedValue(
                    contract,
                    Math.abs(probAfter - probBefore)
                  )}
                </span>
              )}

              {!isAdvancedTrader && !isPseudoNumeric && !isStonk && (
                <InfoTooltip
                  text={`Your bet will move the probability of Yes from ${getFormattedMappedValue(
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
                    {advancedTraderMode ? 'Advanced' : 'Default'}
                  </span>
                  <ChevronDownIcon className="ml-1 h-3 w-3" />
                </button>
              </div>
            )}
          </Row>
        </Col>
      )}
      {/* <Col className={clsx(option !== 'LIMIT' && 'hidden')}>
        <LimitOrderPanel
        
          contract={contract}
          multiProps={multiProps}
          hidden={!seeLimit}
          user={user}
          unfilledBets={unfilledBets}
          balanceByUserId={balanceByUserId}
        />

        <YourOrders
          className="mt-2 rounded-lg bg-indigo-400/10 px-4 py-2"
          contract={contract}
          bets={unfilledBetsMatchingAnswer}
        />
      </Col> */}
    </Col>
  )
}
