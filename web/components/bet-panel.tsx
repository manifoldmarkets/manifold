import clsx from 'clsx'
import React, { useEffect, useState } from 'react'
import { partition, sumBy } from 'lodash'
import { SwitchHorizontalIcon } from '@heroicons/react/solid'

import { useUser } from 'web/hooks/use-user'
import { CPMMBinaryContract } from 'common/contract'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { Spacer } from './layout/spacer'
import { YesNoSelector } from './yes-no-selector'
import {
  formatMoney,
  formatPercent,
  formatWithCommas,
} from 'common/util/format'
import { Title } from './title'
import { User } from 'web/lib/firebase/users'
import { Bet } from 'common/bet'
import { APIError, placeBet } from 'web/lib/firebase/api-call'
import { sellShares } from 'web/lib/firebase/api-call'
import { AmountInput, BuyAmountInput } from './amount-input'
import { InfoTooltip } from './info-tooltip'
import { BinaryOutcomeLabel } from './outcome-label'
import {
  calculatePayoutAfterCorrectBet,
  calculateShares,
  getProbability,
  getOutcomeProbabilityAfterBet,
} from 'common/calculate'
import { useFocus } from 'web/hooks/use-focus'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import {
  calculateCpmmSale,
  getCpmmProbability,
  getCpmmLiquidityFee,
} from 'common/calculate-cpmm'
import { SellRow } from './sell-row'
import { useSaveShares } from './use-save-shares'
import { SignUpPrompt } from './sign-up-prompt'
import { isIOS } from 'web/lib/util/device'
import { ProbabilityInput } from './probability-input'
import { track } from 'web/lib/service/analytics'

export function BetPanel(props: {
  contract: CPMMBinaryContract
  className?: string
}) {
  const { contract, className } = props
  const user = useUser()
  const userBets = useUserContractBets(user?.id, contract.id)
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
          'relative rounded-b-md bg-white px-8 py-6 pt-12',
          !sharesOutcome && 'rounded-t-md',
          className
        )}
      >
        <button
          className="btn btn-ghost btn-sm absolute right-3 top-1 mt-1 gap-2 self-end text-sm normal-case"
          onClick={() => setIsLimitOrder(!isLimitOrder)}
        >
          <SwitchHorizontalIcon className="inline h-4 w-4" />
          {isLimitOrder ? <>Simple bet</> : <>Limit bet</>}
        </button>
        <div className="mb-6 text-2xl">
          {isLimitOrder ? <>Bet to a probability</> : <>Place your bet</>}
        </div>

        <BuyPanel contract={contract} user={user} isLimitOrder={isLimitOrder} />

        <SignUpPrompt />
      </Col>
    </Col>
  )
}

export function BetPanelSwitcher(props: {
  contract: CPMMBinaryContract
  className?: string
  title?: string // Set if BetPanel is on a feed modal
  selected?: 'YES' | 'NO'
  onBetSuccess?: () => void
}) {
  const { contract, className, title, selected, onBetSuccess } = props

  const { mechanism } = contract

  const user = useUser()
  const userBets = useUserContractBets(user?.id, contract.id)

  const [tradeType, setTradeType] = useState<'BUY' | 'SELL'>('BUY')

  const { yesFloorShares, noFloorShares, yesShares, noShares } = useSaveShares(
    contract,
    userBets
  )

  const floorShares = yesFloorShares || noFloorShares
  const sharesOutcome = yesFloorShares
    ? 'YES'
    : noFloorShares
    ? 'NO'
    : undefined

  useEffect(() => {
    // Switch back to BUY if the user has sold all their shares.
    if (tradeType === 'SELL' && sharesOutcome === undefined) {
      setTradeType('BUY')
    }
  }, [tradeType, sharesOutcome])

  return (
    <Col className={className}>
      {sharesOutcome && mechanism === 'cpmm-1' && (
        <Col className="rounded-t-md bg-gray-100 px-6 py-6">
          <Row className="items-center justify-between gap-2">
            <div>
              You have {formatWithCommas(floorShares)}{' '}
              <BinaryOutcomeLabel outcome={sharesOutcome} /> shares
            </div>

            {tradeType === 'BUY' && (
              <button
                className="btn btn-sm"
                style={{
                  backgroundColor: 'white',
                  border: '2px solid',
                  color: '#3D4451',
                }}
                onClick={() =>
                  tradeType === 'BUY'
                    ? setTradeType('SELL')
                    : setTradeType('BUY')
                }
              >
                {tradeType === 'BUY' ? 'Sell' : 'Bet'}
              </button>
            )}
          </Row>
        </Col>
      )}

      <Col
        className={clsx(
          'rounded-b-md bg-white px-8 py-6',
          !sharesOutcome && 'rounded-t-md'
        )}
      >
        <Title
          className={clsx(
            '!mt-0',
            tradeType === 'BUY' && title ? '!text-xl' : ''
          )}
          text={tradeType === 'BUY' ? title ?? 'Place a trade' : 'Sell shares'}
        />

        {tradeType === 'SELL' && user && sharesOutcome && (
          <SellPanel
            contract={contract}
            shares={yesShares || noShares}
            sharesOutcome={sharesOutcome}
            user={user}
            userBets={userBets ?? []}
            onSellSuccess={onBetSuccess}
          />
        )}

        {tradeType === 'BUY' && (
          <BuyPanel
            contract={contract}
            user={user}
            selected={selected}
            onBuySuccess={onBetSuccess}
          />
        )}

        <SignUpPrompt />
      </Col>
    </Col>
  )
}

function BuyPanel(props: {
  contract: CPMMBinaryContract
  user: User | null | undefined
  isLimitOrder?: boolean
  selected?: 'YES' | 'NO'
  onBuySuccess?: () => void
}) {
  const { contract, user, isLimitOrder, selected, onBuySuccess } = props

  const initialProb = getProbability(contract)

  const [betChoice, setBetChoice] = useState<'YES' | 'NO' | undefined>(selected)
  const [betAmount, setBetAmount] = useState<number | undefined>(undefined)
  const [betProb, setBetProb] = useState<number | undefined>(
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

    setError(undefined)
    setIsSubmitting(true)

    placeBet({
      amount: betAmount,
      outcome: betChoice,
      contractId: contract.id,
    })
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

  const outcomeProb = getOutcomeProbabilityAfterBet(
    contract,
    betChoice || 'YES',
    betAmount ?? 0
  )
  const resultProb = betChoice === 'NO' ? 1 - outcomeProb : outcomeProb

  const shares = calculateShares(contract, betAmount ?? 0, betChoice || 'YES')

  const currentPayout = betAmount
    ? calculatePayoutAfterCorrectBet(contract, {
        outcome: betChoice,
        amount: betAmount,
        shares,
      } as Bet)
    : 0

  const currentReturn = betAmount ? (currentPayout - betAmount) / betAmount : 0
  const currentReturnPercent = formatPercent(currentReturn)

  const cpmmFees = getCpmmLiquidityFee(
    contract,
    betAmount ?? 0,
    betChoice ?? 'YES'
  ).totalFees

  return (
    <>
      <YesNoSelector
        className="mb-4"
        btnClassName="flex-1"
        selected={betChoice}
        onSelect={(choice) => onBetChoice(choice)}
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
          <div className="my-3 text-left text-sm text-gray-500">
            Probability
          </div>
          <ProbabilityInput
            inputClassName="w-full max-w-none"
            prob={betProb}
            onChange={setBetProb}
            error={error}
            setError={setError}
            disabled={isSubmitting}
          />
        </>
      )}
      <Col className="mt-3 w-full gap-3">
        {!isLimitOrder && (
          <Row className="items-center justify-between text-sm">
            <div className="text-gray-500">Probability</div>
            <div>
              {formatPercent(initialProb)}
              <span className="mx-2">→</span>
              {formatPercent(resultProb)}
            </div>
          </Row>
        )}

        <Row className="items-center justify-between gap-2 text-sm">
          <Row className="flex-nowrap items-center gap-2 whitespace-nowrap text-gray-500">
            <div>
              Payout if <BinaryOutcomeLabel outcome={betChoice ?? 'YES'} />
            </div>
            <InfoTooltip text={`Includes ${formatMoney(cpmmFees)} in fees`} />
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
  contract: CPMMBinaryContract
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

  const betDisabled = isSubmitting || !amount || error

  async function submitSell() {
    if (!user || !amount) return

    setError(undefined)
    setIsSubmitting(true)

    // Sell all shares if remaining shares would be < 1
    const sellAmount = amount === Math.floor(shares) ? shares : amount

    await sellShares({
      shares: sellAmount,
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
      shares: sellAmount,
      outcome: sharesOutcome,
    })
  }

  const initialProb = getProbability(contract)
  const { newPool } = calculateCpmmSale(
    contract,
    Math.min(amount ?? 0, shares),
    sharesOutcome
  )
  const resultProb = getCpmmProbability(newPool, contract.p)

  const openUserBets = userBets.filter((bet) => !bet.isSold && !bet.sale)
  const [yesBets, noBets] = partition(
    openUserBets,
    (bet) => bet.outcome === 'YES'
  )
  const [yesShares, noShares] = [
    sumBy(yesBets, (bet) => bet.shares),
    sumBy(noBets, (bet) => bet.shares),
  ]

  const sellOutcome = yesShares ? 'YES' : noShares ? 'NO' : undefined
  const ownedShares = Math.round(yesShares) || Math.round(noShares)

  const sharesSold = Math.min(amount ?? 0, ownedShares)

  const { saleValue } = calculateCpmmSale(
    contract,
    sharesSold,
    sellOutcome as 'YES' | 'NO'
  )

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
          <div className="text-gray-500">Probability</div>
          <div>
            {formatPercent(initialProb)}
            <span className="mx-2">→</span>
            {formatPercent(resultProb)}
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
