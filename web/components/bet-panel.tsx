import clsx from 'clsx'
import React, { useEffect, useState } from 'react'
import { partition, sumBy } from 'lodash'
import { SwitchHorizontalIcon } from '@heroicons/react/solid'

import { useUser } from 'web/hooks/use-user'
import { CPMMBinaryContract, PseudoNumericContract } from 'common/contract'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { Spacer } from './layout/spacer'
import { YesNoSelector } from './yes-no-selector'
import {
  formatMoney,
  formatMoneyWithDecimals,
  formatPercent,
  formatWithCommas,
} from 'common/util/format'
import { getBinaryCpmmBetInfo } from 'common/new-bet'
import { Title } from './title'
import { User } from 'web/lib/firebase/users'
import { Bet, LimitBet } from 'common/bet'
import { APIError, placeBet } from 'web/lib/firebase/api-call'
import { sellShares } from 'web/lib/firebase/api-call'
import { AmountInput, BuyAmountInput } from './amount-input'
import { InfoTooltip } from './info-tooltip'
import { BinaryOutcomeLabel } from './outcome-label'
import { getProbability } from 'common/calculate'
import { useFocus } from 'web/hooks/use-focus'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import {
  calculateCpmmSale,
  getCpmmProbability,
  getCpmmFees,
} from 'common/calculate-cpmm'
import {
  getFormattedMappedValue,
  getPseudoProbability,
} from 'common/pseudo-numeric'
import { SellRow } from './sell-row'
import { useSaveShares } from './use-save-shares'
import { SignUpPrompt } from './sign-up-prompt'
import { isIOS } from 'web/lib/util/device'
import { ProbabilityInput } from './probability-input'
import { track } from 'web/lib/service/analytics'
import { removeUndefinedProps } from 'common/util/object'
import { useUnfilledBets } from 'web/hooks/use-bets'
import { LimitBets } from './limit-bets'
import { BucketInput } from './bucket-input'

export function BetPanel(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  className?: string
}) {
  const { contract, className } = props
  const user = useUser()
  const userBets = useUserContractBets(user?.id, contract.id)
  const unfilledBets = useUnfilledBets(contract.id) ?? []
  const yourUnfilledBets = unfilledBets.filter((bet) => bet.userId === user?.id)
  const { yesFloorShares, noFloorShares } = useSaveShares(contract, userBets)
  const sharesOutcome = yesFloorShares
    ? 'YES'
    : noFloorShares
    ? 'NO'
    : undefined

  const [isLimitOrder, setIsLimitOrder] = useState(false)

  return (
    <Col className={className}>
      <SellRow
        contract={contract}
        user={user}
        className={'rounded-t-md bg-gray-100 px-6 py-6'}
      />
      <Col
        className={clsx(
          'relative rounded-b-md bg-white px-8 py-6',
          !sharesOutcome && 'rounded-t-md',
          className
        )}
      >
        <Row className="align-center justify-between">
          <div className="mb-6 text-2xl">
            {isLimitOrder ? <>Limit bet</> : <>Place your bet</>}
          </div>
          <button
            className="btn btn-ghost btn-sm text-sm normal-case"
            onClick={() => setIsLimitOrder(!isLimitOrder)}
          >
            <SwitchHorizontalIcon className="inline h-6 w-6" />
          </button>
        </Row>

        <BuyPanel
          contract={contract}
          user={user}
          isLimitOrder={isLimitOrder}
          unfilledBets={unfilledBets}
        />

        <SignUpPrompt />
      </Col>
      {yourUnfilledBets.length > 0 && (
        <LimitBets
          className="mt-4"
          contract={contract}
          bets={yourUnfilledBets}
        />
      )}
    </Col>
  )
}

export function SimpleBetPanel(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  className?: string
  selected?: 'YES' | 'NO'
  onBetSuccess?: () => void
}) {
  const { contract, className, selected, onBetSuccess } = props

  const user = useUser()
  const [isLimitOrder, setIsLimitOrder] = useState(false)

  const unfilledBets = useUnfilledBets(contract.id) ?? []
  const yourUnfilledBets = unfilledBets.filter((bet) => bet.userId === user?.id)

  return (
    <Col className={className}>
      <Col className={clsx('rounded-b-md rounded-t-md bg-white px-8 py-6')}>
        <Row className="justify-between">
          <Title
            className={clsx('!mt-0')}
            text={isLimitOrder ? 'Limit bet' : 'Place a trade'}
          />

          <button
            className="btn btn-ghost btn-sm text-sm normal-case"
            onClick={() => setIsLimitOrder(!isLimitOrder)}
          >
            <SwitchHorizontalIcon className="inline h-6 w-6" />
          </button>
        </Row>

        <BuyPanel
          contract={contract}
          user={user}
          unfilledBets={unfilledBets}
          selected={selected}
          onBuySuccess={onBetSuccess}
          isLimitOrder={isLimitOrder}
        />

        <SignUpPrompt />
      </Col>

      {yourUnfilledBets.length > 0 && (
        <LimitBets
          className="mt-4"
          contract={contract}
          bets={yourUnfilledBets}
        />
      )}
    </Col>
  )
}

function BuyPanel(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  user: User | null | undefined
  unfilledBets: Bet[]
  isLimitOrder?: boolean
  selected?: 'YES' | 'NO'
  onBuySuccess?: () => void
}) {
  const { contract, user, unfilledBets, isLimitOrder, selected, onBuySuccess } =
    props

  const initialProb = getProbability(contract)
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'

  const [betChoice, setBetChoice] = useState<'YES' | 'NO' | undefined>(selected)
  const [betAmount, setBetAmount] = useState<number | undefined>(undefined)
  const [limitProb, setLimitProb] = useState<number | undefined>(
    Math.round(100 * initialProb)
  )
  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [wasSubmitted, setWasSubmitted] = useState(false)

  const [inputRef, focusAmountInput] = useFocus()

  useEffect(() => {
    if (selected) {
      if (isIOS()) window.scrollTo(0, window.scrollY + 200)
      focusAmountInput()
    }
  }, [selected, focusAmountInput])

  function onBetChoice(choice: 'YES' | 'NO') {
    setBetChoice(choice)
    setWasSubmitted(false)
    focusAmountInput()
  }

  function onBetChange(newAmount: number | undefined) {
    setWasSubmitted(false)
    setBetAmount(newAmount)
    if (!betChoice) {
      setBetChoice('YES')
    }
  }

  async function submitBet() {
    if (!user || !betAmount) return
    if (isLimitOrder && limitProb === undefined) return

    const limitProbScaled =
      isLimitOrder && limitProb !== undefined ? limitProb / 100 : undefined

    setError(undefined)
    setIsSubmitting(true)

    placeBet(
      removeUndefinedProps({
        amount: betAmount,
        outcome: betChoice,
        contractId: contract.id,
        limitProb: limitProbScaled,
      })
    )
      .then((r) => {
        console.log('placed bet. Result:', r)
        setIsSubmitting(false)
        setWasSubmitted(true)
        setBetAmount(undefined)
        if (onBuySuccess) onBuySuccess()
      })
      .catch((e) => {
        if (e instanceof APIError) {
          setError(e.toString())
        } else {
          console.error(e)
          setError('Error placing bet')
        }
        setIsSubmitting(false)
      })

    track('bet', {
      location: 'bet panel',
      outcomeType: contract.outcomeType,
      slug: contract.slug,
      contractId: contract.id,
      amount: betAmount,
      outcome: betChoice,
    })
  }

  const betDisabled = isSubmitting || !betAmount || error

  const limitProbFrac = (limitProb ?? 0) / 100

  const { newPool, newP, newBet } = getBinaryCpmmBetInfo(
    betChoice ?? 'YES',
    betAmount ?? 0,
    contract,
    isLimitOrder ? limitProbFrac : undefined,
    unfilledBets as LimitBet[]
  )

  const resultProb = getCpmmProbability(newPool, newP)
  const matchedAmount = sumBy(newBet.fills, (fill) => fill.amount)
  const filledShares = sumBy(newBet.fills, (fill) => fill.shares)
  const overallShares =
    filledShares +
    ((betAmount ?? 0) - matchedAmount) /
      (betChoice === 'YES' ? limitProbFrac : 1 - limitProbFrac)

  const currentPayout = overallShares

  const currentReturn = betAmount ? (currentPayout - betAmount) / betAmount : 0
  const currentReturnPercent = formatPercent(currentReturn)

  const cpmmFees = getCpmmFees(
    contract,
    betAmount ?? 0,
    betChoice ?? 'YES'
  ).totalFees

  const format = getFormattedMappedValue(contract)

  return (
    <>
      <YesNoSelector
        className="mb-4"
        btnClassName="flex-1"
        selected={betChoice}
        onSelect={(choice) => onBetChoice(choice)}
        isPseudoNumeric={isPseudoNumeric}
      />
      <div className="my-3 text-left text-sm text-gray-500">Amount</div>
      <BuyAmountInput
        inputClassName="w-full max-w-none"
        amount={betAmount}
        onChange={onBetChange}
        error={error}
        setError={setError}
        disabled={isSubmitting}
        inputRef={inputRef}
      />
      {isLimitOrder && (
        <>
          <Row className="my-3 items-center gap-2 text-left text-sm text-gray-500">
            Limit {isPseudoNumeric ? 'value' : 'probability'}
            <InfoTooltip
              text={`Bet ${betChoice === 'NO' ? 'down' : 'up'} to this ${
                isPseudoNumeric ? 'value' : 'probability'
              } and wait to match other bets.`}
            />
          </Row>
          {isPseudoNumeric ? (
            <BucketInput
              contract={contract}
              onBucketChange={(value) =>
                setLimitProb(
                  value === undefined
                    ? undefined
                    : 100 *
                        getPseudoProbability(
                          value,
                          contract.min,
                          contract.max,
                          contract.isLogScale
                        )
                )
              }
              isSubmitting={isSubmitting}
            />
          ) : (
            <ProbabilityInput
              inputClassName="w-full max-w-none"
              prob={limitProb}
              onChange={setLimitProb}
              disabled={isSubmitting}
            />
          )}
        </>
      )}
      <Col className="mt-3 w-full gap-3">
        {!isLimitOrder && (
          <Row className="items-center justify-between text-sm">
            <div className="text-gray-500">
              {isPseudoNumeric ? 'Estimated value' : 'Probability'}
            </div>
            <div>
              {format(initialProb)}
              <span className="mx-2">→</span>
              {format(resultProb)}
            </div>
          </Row>
        )}

        <Row className="items-center justify-between gap-2 text-sm">
          <Row className="flex-nowrap items-center gap-2 whitespace-nowrap text-gray-500">
            <div>
              {isPseudoNumeric ? (
                'Max payout'
              ) : (
                <>
                  Payout if <BinaryOutcomeLabel outcome={betChoice ?? 'YES'} />
                </>
              )}
            </div>
            <InfoTooltip
              text={`Includes ${formatMoneyWithDecimals(cpmmFees)} in fees`}
            />
          </Row>
          <div>
            <span className="mr-2 whitespace-nowrap">
              {formatMoney(currentPayout)}
            </span>
            (+{currentReturnPercent})
          </div>
        </Row>
      </Col>

      <Spacer h={8} />

      {user && (
        <button
          className={clsx(
            'btn flex-1',
            betDisabled
              ? 'btn-disabled'
              : betChoice === 'YES'
              ? 'btn-primary'
              : 'border-none bg-red-400 hover:bg-red-500',
            isSubmitting ? 'loading' : ''
          )}
          onClick={betDisabled ? undefined : submitBet}
        >
          {isSubmitting ? 'Submitting...' : 'Submit bet'}
        </button>
      )}

      {wasSubmitted && <div className="mt-4">Bet submitted!</div>}
    </>
  )
}

export function SellPanel(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  userBets: Bet[]
  shares: number
  sharesOutcome: 'YES' | 'NO'
  user: User
  onSellSuccess?: () => void
}) {
  const { contract, shares, sharesOutcome, userBets, user, onSellSuccess } =
    props

  const [amount, setAmount] = useState<number | undefined>(shares)
  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [wasSubmitted, setWasSubmitted] = useState(false)

  const unfilledBets = useUnfilledBets(contract.id) ?? []

  const betDisabled = isSubmitting || !amount || error

  // Sell all shares if remaining shares would be < 1
  const sellQuantity = amount === Math.floor(shares) ? shares : amount

  async function submitSell() {
    if (!user || !amount) return

    setError(undefined)
    setIsSubmitting(true)

    await sellShares({
      shares: sellQuantity,
      outcome: sharesOutcome,
      contractId: contract.id,
    })
      .then((r) => {
        console.log('Sold shares. Result:', r)
        setIsSubmitting(false)
        setWasSubmitted(true)
        setAmount(undefined)
        if (onSellSuccess) onSellSuccess()
      })
      .catch((e) => {
        if (e instanceof APIError) {
          setError(e.toString())
        } else {
          console.error(e)
          setError('Error selling')
        }
        setIsSubmitting(false)
      })

    track('sell shares', {
      outcomeType: contract.outcomeType,
      slug: contract.slug,
      contractId: contract.id,
      shares: sellQuantity,
      outcome: sharesOutcome,
    })
  }

  const initialProb = getProbability(contract)
  const { cpmmState, saleValue } = calculateCpmmSale(
    contract,
    sellQuantity ?? 0,
    sharesOutcome,
    unfilledBets
  )
  const resultProb = getCpmmProbability(cpmmState.pool, cpmmState.p)

  const openUserBets = userBets.filter((bet) => !bet.isSold && !bet.sale)
  const [yesBets, noBets] = partition(
    openUserBets,
    (bet) => bet.outcome === 'YES'
  )
  const [yesShares, noShares] = [
    sumBy(yesBets, (bet) => bet.shares),
    sumBy(noBets, (bet) => bet.shares),
  ]

  const ownedShares = Math.round(yesShares) || Math.round(noShares)

  const onAmountChange = (amount: number | undefined) => {
    setAmount(amount)

    // Check for errors.
    if (amount !== undefined) {
      if (amount > ownedShares) {
        setError(`Maximum ${formatWithCommas(Math.floor(ownedShares))} shares`)
      } else {
        setError(undefined)
      }
    }
  }

  const { outcomeType } = contract
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'
  const format = getFormattedMappedValue(contract)

  return (
    <>
      <AmountInput
        amount={
          amount
            ? Math.round(amount) === 0
              ? 0
              : Math.floor(amount)
            : undefined
        }
        onChange={onAmountChange}
        label="Qty"
        error={error}
        disabled={isSubmitting}
        inputClassName="w-full"
      />

      <Col className="mt-3 w-full gap-3 text-sm">
        <Row className="items-center justify-between gap-2 text-gray-500">
          Sale proceeds
          <span className="text-neutral">{formatMoney(saleValue)}</span>
        </Row>
        <Row className="items-center justify-between">
          <div className="text-gray-500">
            {isPseudoNumeric ? 'Estimated value' : 'Probability'}
          </div>
          <div>
            {format(initialProb)}
            <span className="mx-2">→</span>
            {format(resultProb)}
          </div>
        </Row>
      </Col>

      <Spacer h={8} />

      <button
        className={clsx(
          'btn flex-1',
          betDisabled
            ? 'btn-disabled'
            : sharesOutcome === 'YES'
            ? 'btn-primary'
            : 'border-none bg-red-400 hover:bg-red-500',
          isSubmitting ? 'loading' : ''
        )}
        onClick={betDisabled ? undefined : submitSell}
      >
        {isSubmitting ? 'Submitting...' : 'Submit sell'}
      </button>

      {wasSubmitted && <div className="mt-4">Sell submitted!</div>}
    </>
  )
}
