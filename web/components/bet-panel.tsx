import clsx from 'clsx'
import React, { useEffect, useState } from 'react'
import { partition, sumBy } from 'lodash'

import { useUser } from 'web/hooks/use-user'
import { Binary, CPMM, Contract } from 'common/contract'
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
import { sellShares } from 'web/lib/firebase/fn-call'
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

export function BetPanel(props: {
  contract: Contract & Binary
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

  return (
    <Col className={className}>
      <SellRow
        contract={contract}
        user={user}
        className={'rounded-t-md bg-gray-100 px-6 py-6'}
      />
      <Col
        className={clsx(
          'rounded-b-md bg-white px-8 py-6',
          !sharesOutcome && 'rounded-t-md',
          className
        )}
      >
        <div className="mb-6 text-2xl">Place your bet</div>
        {/* <Title className={clsx('!mt-0 text-neutral')} text="Place a trade" /> */}

        <BuyPanel contract={contract} user={user} />

        <SignUpPrompt />
      </Col>
    </Col>
  )
}

export function BetPanelSwitcher(props: {
  contract: Contract & Binary
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

        {tradeType === 'SELL' &&
          mechanism == 'cpmm-1' &&
          user &&
          sharesOutcome && (
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
  contract: Contract & Binary
  user: User | null | undefined
  selected?: 'YES' | 'NO'
  onBuySuccess?: () => void
}) {
  const { contract, user, selected, onBuySuccess } = props

  const [betChoice, setBetChoice] = useState<'YES' | 'NO' | undefined>(selected)
  const [betAmount, setBetAmount] = useState<number | undefined>(undefined)
  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [wasSubmitted, setWasSubmitted] = useState(false)

  const [inputRef, focusAmountInput] = useFocus()

  useEffect(() => {
    // warm up cloud function
    placeBet({}).catch(() => {})
  }, [])

  useEffect(() => {
    if (selected) focusAmountInput()
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
  }

  const betDisabled = isSubmitting || !betAmount || error

  const initialProb = getProbability(contract)

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

  const cpmmFees =
    contract.mechanism === 'cpmm-1' &&
    getCpmmLiquidityFee(contract, betAmount ?? 0, betChoice ?? 'YES').totalFees

  const dpmTooltip =
    contract.mechanism === 'dpm-2'
      ? `Current payout for ${formatWithCommas(shares)} / ${formatWithCommas(
          shares +
            contract.totalShares[betChoice ?? 'YES'] -
            (contract.phantomShares
              ? contract.phantomShares[betChoice ?? 'YES']
              : 0)
        )} ${betChoice ?? 'YES'} shares`
      : undefined
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

      <Col className="mt-3 w-full gap-3">
        <Row className="items-center justify-between text-sm">
          <div className="text-gray-500">Probability</div>
          <div>
            {formatPercent(initialProb)}
            <span className="mx-2">→</span>
            {formatPercent(resultProb)}
          </div>
        </Row>

        <Row className="items-center justify-between gap-2 text-sm">
          <Row className="flex-nowrap items-center gap-2 whitespace-nowrap text-gray-500">
            <div>
              {contract.mechanism === 'dpm-2' ? (
                <>
                  Estimated
                  <br /> payout if{' '}
                  <BinaryOutcomeLabel outcome={betChoice ?? 'YES'} />
                </>
              ) : (
                <>
                  Payout if <BinaryOutcomeLabel outcome={betChoice ?? 'YES'} />
                </>
              )}
            </div>

            {cpmmFees !== false && (
              <InfoTooltip text={`Includes ${formatMoney(cpmmFees)} in fees`} />
            )}

            {dpmTooltip && <InfoTooltip text={dpmTooltip} />}
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
  contract: Contract & CPMM & Binary
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

    const result = await sellShares({
      shares: sellAmount,
      outcome: sharesOutcome,
      contractId: contract.id,
    }).then((r) => r.data)

    console.log('Sold shares. Result:', result)

    if (result?.status === 'success') {
      setIsSubmitting(false)
      setWasSubmitted(true)
      setAmount(undefined)
      if (onSellSuccess) onSellSuccess()
    } else {
      setError(result?.message || 'Error selling')
      setIsSubmitting(false)
    }
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
