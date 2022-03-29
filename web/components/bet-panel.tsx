import clsx from 'clsx'
import React, { useEffect, useState } from 'react'
import _ from 'lodash'

import { useUser } from '../hooks/use-user'
import { Binary, CPMM, DPM, FullContract } from '../../common/contract'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { Spacer } from './layout/spacer'
import { YesNoSelector } from './yes-no-selector'
import {
  formatMoney,
  formatPercent,
  formatWithCommas,
} from '../../common/util/format'
import { Title } from './title'
import { firebaseLogin, User } from '../lib/firebase/users'
import { Bet } from '../../common/bet'
import { placeBet, sellShares } from '../lib/firebase/api-call'
import { BuyAmountInput, SellAmountInput } from './amount-input'
import { InfoTooltip } from './info-tooltip'
import { OutcomeLabel } from './outcome-label'
import {
  calculatePayoutAfterCorrectBet,
  calculateShares,
  getProbability,
  getOutcomeProbabilityAfterBet,
} from '../../common/calculate'
import { useFocus } from '../hooks/use-focus'
import { useUserContractBets } from '../hooks/use-user-bets'
import {
  calculateCpmmSale,
  getCpmmProbability,
} from '../../common/calculate-cpmm'

export function BetPanel(props: {
  contract: FullContract<DPM | CPMM, Binary>
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

  const { yesShares, noShares } = useSaveShares(contract, userBets)

  const shares = yesShares || noShares
  const sharesOutcome = yesShares ? 'YES' : noShares ? 'NO' : undefined

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
              You have {formatWithCommas(Math.floor(shares))}{' '}
              <OutcomeLabel outcome={sharesOutcome} /> shares
            </div>

            <button
              className="btn btn-sm"
              style={{
                backgroundColor: 'white',
                border: '2px solid',
                color: '#3D4451',
              }}
              onClick={() =>
                tradeType === 'BUY' ? setTradeType('SELL') : setTradeType('BUY')
              }
            >
              {tradeType === 'BUY' ? 'Sell' : 'Buy'}
            </button>
          </Row>
        </Col>
      )}

      <Col
        className={clsx(
          'rounded-b-md bg-white px-8 py-6',
          !sharesOutcome && 'rounded-t-md',
          className
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
            contract={contract as FullContract<CPMM, Binary>}
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
            userBets={userBets ?? []}
            selected={selected}
            onBuySuccess={onBetSuccess}
          />
        )}

        {user === null && (
          <button
            className="btn flex-1 whitespace-nowrap border-none bg-gradient-to-r from-teal-500 to-green-500 px-10 text-lg font-medium normal-case hover:from-teal-600 hover:to-green-600"
            onClick={firebaseLogin}
          >
            Sign in to trade!
          </button>
        )}
      </Col>
    </Col>
  )
}

function BuyPanel(props: {
  contract: FullContract<DPM | CPMM, Binary>
  user: User | null | undefined
  userBets: Bet[]
  selected?: 'YES' | 'NO'
  onBuySuccess?: () => void
}) {
  const { contract, user, userBets, selected, onBuySuccess } = props

  const [betChoice, setBetChoice] = useState<'YES' | 'NO' | undefined>(selected)
  const [betAmount, setBetAmount] = useState<number | undefined>(undefined)
  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [wasSubmitted, setWasSubmitted] = useState(false)

  const [inputRef, focusAmountInput] = useFocus()

  useEffect(() => {
    // warm up cloud function
    placeBet({}).catch()
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

    const result = await placeBet({
      amount: betAmount,
      outcome: betChoice,
      contractId: contract.id,
    }).then((r) => r.data as any)

    console.log('placed bet. Result:', result)

    if (result?.status === 'success') {
      setIsSubmitting(false)
      setWasSubmitted(true)
      setBetAmount(undefined)
      if (onBuySuccess) onBuySuccess()
    } else {
      setError(result?.message || 'Error placing bet')
      setIsSubmitting(false)
    }
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
        selected={betChoice}
        onSelect={(choice) => onBetChoice(choice)}
      />
      <div className="my-3 text-left text-sm text-gray-500">Amount</div>
      <BuyAmountInput
        inputClassName="w-full"
        amount={betAmount}
        onChange={onBetChange}
        userBets={userBets}
        error={error}
        setError={setError}
        disabled={isSubmitting}
        inputRef={inputRef}
        contractIdForLoan={contract.id}
      />

      <Col className="mt-3 w-full gap-3">
        <Row className="items-center justify-between text-sm">
          <div className="text-gray-500">Probability</div>
          <Row>
            <div>{formatPercent(initialProb)}</div>
            <div className="mx-2">→</div>
            <div>{formatPercent(resultProb)}</div>
          </Row>
        </Row>

        <Row className="items-center justify-between gap-2 text-sm">
          <Row className="flex-nowrap items-center gap-2 whitespace-nowrap text-gray-500">
            <div>
              {contract.mechanism === 'dpm-2' ? (
                <>
                  Estimated
                  <br /> payout if <OutcomeLabel outcome={betChoice ?? 'YES'} />
                </>
              ) : (
                <>
                  Payout if <OutcomeLabel outcome={betChoice ?? 'YES'} />
                </>
              )}
            </div>

            {dpmTooltip && <InfoTooltip text={dpmTooltip} />}
          </Row>
          <Row className="flex-wrap items-end justify-end gap-2">
            <span className="whitespace-nowrap">
              {formatMoney(currentPayout)}
            </span>
            <span>(+{currentReturnPercent})</span>
          </Row>
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
          {isSubmitting ? 'Submitting...' : 'Submit Buy'}
        </button>
      )}

      {wasSubmitted && <div className="mt-4">Buy submitted!</div>}
    </>
  )
}

function SellPanel(props: {
  contract: FullContract<CPMM, Binary>
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
  const { newPool } = calculateCpmmSale(contract, {
    shares: amount ?? 0,
    outcome: sharesOutcome,
  })
  const resultProb = getCpmmProbability(newPool, contract.p)

  return (
    <>
      <SellAmountInput
        inputClassName="w-full"
        contract={contract}
        amount={amount ? Math.floor(amount) : undefined}
        onChange={setAmount}
        userBets={userBets}
        error={error}
        setError={setError}
        disabled={isSubmitting}
      />

      <Col className="mt-3 w-full gap-3">
        <Row className="items-center justify-between text-sm">
          <div className="text-gray-500">Probability</div>
          <Row>
            <div>{formatPercent(initialProb)}</div>
            <div className="mx-2">→</div>
            <div>{formatPercent(resultProb)}</div>
          </Row>
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

const useSaveShares = (
  contract: FullContract<CPMM | DPM, Binary>,
  userBets: Bet[] | undefined
) => {
  const [savedShares, setSavedShares] = useState<
    { yesShares: number; noShares: number } | undefined
  >()

  const [yesBets, noBets] = _.partition(
    userBets ?? [],
    (bet) => bet.outcome === 'YES'
  )
  const [yesShares, noShares] = [
    _.sumBy(yesBets, (bet) => bet.shares),
    _.sumBy(noBets, (bet) => bet.shares),
  ]

  useEffect(() => {
    // Save yes and no shares to local storage.
    const savedShares = localStorage.getItem(`${contract.id}-shares`)
    if (!userBets && savedShares) {
      setSavedShares(JSON.parse(savedShares))
    }

    if (userBets) {
      const updatedShares = { yesShares, noShares }
      localStorage.setItem(
        `${contract.id}-shares`,
        JSON.stringify(updatedShares)
      )
    }
  }, [contract.id, userBets, noShares, yesShares])

  if (userBets) return { yesShares, noShares }
  return savedShares ?? { yesShares: 0, noShares: 0 }
}
