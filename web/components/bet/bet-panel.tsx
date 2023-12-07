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
import { User, firebaseLogin } from 'web/lib/firebase/users'
import { LimitBet } from 'common/bet'
import { APIError, api } from 'web/lib/firebase/api'
import { BuyAmountInput } from '../widgets/amount-input'

import { useFocus } from 'web/hooks/use-focus'
import { useUnfilledBetsAndBalanceByUserId } from '../../hooks/use-bets'
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

  useEffect(() => {
    if (initialOutcome) {
      setOption(initialOutcome)
    }
  }, [initialOutcome])

  function onOptionChoice(choice: 'YES' | 'NO' | 'LIMIT') {
    if (option === choice && !initialOutcome) {
      setOption(undefined)
    } else {
      // Skip for modals, we are tracking intent at the trigger call sites
      if (inModal === false) {
        track('bet intent', { location, option })
      }
      setOption(choice)
    }
    if (!isIOS() && !isAndroid()) {
      focusAmountInput()
    }
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
        {!!user && !isStonk && (
          <Button
            color={seeLimit ? 'indigo' : 'indigo-outline'}
            onClick={() => onOptionChoice('LIMIT')}
            className="px-2 text-lg sm:px-6"
            size="lg"
          >
            %
          </Button>
        )}
      </Row>
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
        <div className="text-ink-700 mb-1 mt-2 text-sm">Amount</div>

        <BuyAmountInput
          inputClassName="w-full max-w-none"
          amount={betAmount}
          onChange={onBetChange}
          error={error}
          setError={setError}
          disabled={isSubmitting}
          inputRef={inputRef}
          sliderOptions={{ show: true, wrap: false }}
          binaryOutcome={outcome}
          showBalance
        />

        <Row className="mb-4 mt-8 w-full">
          <Col className="w-1/2">
            <Col className="text-ink-700 flex-nowrap whitespace-nowrap text-sm">
              {isPseudoNumeric || isStonk ? (
                'Shares'
              ) : (
                <>Payout if {outcome ?? 'YES'}</>
              )}
            </Col>
            <div>
              <span className="whitespace-nowrap text-lg font-semibold">
                {isStonk
                  ? getStonkDisplayShares(contract, currentPayout, 2)
                  : isPseudoNumeric
                  ? Math.floor(currentPayout)
                  : formatMoney(currentPayout)}
              </span>
              <span className="text-ink-500 pr-3 text-sm">
                {isStonk || isPseudoNumeric ? '' : ' +' + currentReturnPercent}
              </span>
            </div>
          </Col>
          <Col className="w-1/2 text-sm">
            <Row>
              <span className="text-ink-700 whitespace-nowrap text-sm">
                {isPseudoNumeric
                  ? 'Estimated value'
                  : isStonk
                  ? 'New stock price'
                  : 'New probability'}
              </span>
              {!isPseudoNumeric && !isStonk && (
                <InfoTooltip
                  text={`The probability of YES after your ${SINGULAR_BET}`}
                  className="text-ink-400 ml-1"
                  size="sm"
                />
              )}
            </Row>
            {probStayedSame ? (
              <div className="text-lg font-semibold">
                {getFormattedMappedValue(contract, probBefore)}
              </div>
            ) : (
              <div>
                <span className="text-lg font-semibold">
                  {getFormattedMappedValue(contract, probAfter)}
                </span>
                <span
                  className={clsx(
                    'text-sm',
                    highProbMove ? 'text-warning font-semibold' : 'text-ink-500'
                  )}
                >
                  {isPseudoNumeric ? (
                    <></>
                  ) : (
                    <>
                      {' '}
                      {outcome != 'NO' && '+'}
                      {getFormattedMappedValue(
                        contract,
                        probAfter - probBefore
                      )}
                    </>
                  )}
                </span>
              </div>
            )}
          </Col>
        </Row>

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
                : 'Bet'
            }
            inModal={inModal}
          />
        ) : (
          <Button
            color={outcome === 'NO' ? 'red' : 'green'}
            size="xl"
            onClick={withTracking(firebaseLogin, 'login from bet panel')}
          >
            Sign up to predict
          </Button>
        )}
      </Col>
      <Col className={clsx(option !== 'LIMIT' && 'hidden')}>
        <LimitOrderPanel
          className={clsx(
            singularView ? '' : 'rounded-lg bg-indigo-400/10 px-4 py-2'
          )}
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
      </Col>
      {/* Stonks don't allow limit orders but users may have them from before the conversion*/}
      {isStonk && unfilledBets.length > 0 && (
        <YourOrders
          className="mt-2 rounded-lg bg-indigo-400/10 px-4 py-2"
          contract={contract}
          bets={unfilledBets as LimitBet[]}
        />
      )}
    </Col>
  )
}
