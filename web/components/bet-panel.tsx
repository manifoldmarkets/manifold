import { getFunctions, httpsCallable } from 'firebase/functions'
import clsx from 'clsx'
import React, { useState } from 'react'

import { useUser } from '../hooks/use-user'
import { Contract } from '../lib/firebase/contracts'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { Spacer } from './layout/spacer'
import { YesNoSelector } from './yes-no-selector'
import { formatMoney, formatPercent } from '../lib/util/format'
import { Title } from './title'

export function BetPanel(props: { contract: Contract; className?: string }) {
  const { contract, className } = props

  const user = useUser()

  const [betChoice, setBetChoice] = useState<'YES' | 'NO'>('YES')
  const [betAmount, setBetAmount] = useState<number | undefined>(undefined)

  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [wasSubmitted, setWasSubmitted] = useState(false)

  function onBetChoice(choice: 'YES' | 'NO') {
    setBetChoice(choice)
    setWasSubmitted(false)
  }

  function onBetChange(str: string) {
    setWasSubmitted(false)

    const amount = parseInt(str)

    if (
      (str && isNaN(amount)) ||
      // Don't update to amount that is rendered in exponential notation.
      // e.g. '1e21'
      amount.toString().includes('e')
    ) {
      return
    }

    setBetAmount(str ? amount : undefined)

    if (user && user.balance < amount) setError('Insufficient balance')
    else setError(undefined)
  }

  async function submitBet() {
    if (!user || !betAmount) return

    if (user.balance < betAmount) {
      setError('Insufficient balance')
      return
    }

    setError(undefined)
    setIsSubmitting(true)

    const result = await placeBet({
      amount: betAmount,
      outcome: betChoice,
      contractId: contract.id,
    }).then(r => r.data as any)

    console.log('placed bet. Result:', result)

    if (result?.status === 'success') {
      setIsSubmitting(false)
      setWasSubmitted(true)
      setBetAmount(undefined)
    } else {
      setError(result?.error || 'Error placing bet')
      setIsSubmitting(false)
    }
  }

  const betDisabled = isSubmitting || !betAmount || error

  const initialProb = getProbability(contract.pot, betChoice)
  const resultProb = getProbability(contract.pot, betChoice, betAmount)
  const dpmWeight = getDpmWeight(contract.pot, betAmount ?? 0, betChoice)

  const estimatedWinnings = Math.floor((betAmount ?? 0) + dpmWeight)
  const estimatedReturn = betAmount
    ? (estimatedWinnings - betAmount) / betAmount
    : 0
  const estimatedReturnPercent = (estimatedReturn * 100).toFixed() + '%'

  return (
    <Col
      className={clsx(
        'bg-gray-100 shadow-xl px-8 py-6 rounded-md w-full md:w-auto',
        className
      )}
    >
      <Title className="mt-0 whitespace-nowrap" text="Place a bet" />

      <div className="mt-2 mb-1 text-sm text-gray-400">Outcome</div>
      <YesNoSelector
        className="mx-auto my-2"
        selected={betChoice}
        onSelect={(choice) => onBetChoice(choice)}
      />

      <div className="mt-3 mb-1 text-sm text-gray-400">Bet amount</div>
      <Col className="my-2">
        <label className="input-group">
          <span className="text-sm bg-gray-200">M$</span>
          <input
            className={clsx(
              'input input-bordered w-full',
              error && 'input-error'
            )}
            type="text"
            placeholder="0"
            value={betAmount ?? ''}
            onChange={(e) => onBetChange(e.target.value)}
          />
        </label>
        {error && (
          <div className="font-medium tracking-wide text-red-500 text-xs mt-1">
            {error}
          </div>
        )}
      </Col>

      <div className="mt-3 mb-1 text-sm text-gray-400">Remaining balance</div>
      <div>{formatMoney((user?.balance || 0) - (betAmount || 0))}</div>

      <div className="mt-2 mb-1 text-sm text-gray-400">Implied chance</div>
      <Row>
        <div>{formatPercent(initialProb)}</div>
        <div className="mx-2">→</div>
        <div>{formatPercent(resultProb)}</div>
      </Row>

      <div className="mt-2 mb-1 text-sm text-gray-400">Estimated winnings</div>
      <div>
        {formatMoney(estimatedWinnings)} &nbsp; (+{estimatedReturnPercent})
      </div>

      <Spacer h={6} />

      <button
        className={clsx(
          'btn',
          betDisabled
            ? 'btn-disabled'
            : betChoice === 'YES'
              ? 'btn-primary'
              : 'bg-red-400 hover:bg-red-500 border-none',
          isSubmitting ? 'loading' : ''
        )}
        onClick={betDisabled ? undefined : submitBet}
      >
        {isSubmitting ? 'Submitting...' : 'Place bet'}
      </button>

      {wasSubmitted && <div className="mt-4">Bet submitted!</div>}
    </Col>
  )
}

const functions = getFunctions()
export const placeBet = httpsCallable(functions, 'placeBet')

const getProbability = (
  pot: { YES: number; NO: number },
  outcome: 'YES' | 'NO',
  bet = 0
) => {
  const [yesPot, noPot] = [
    pot.YES + (outcome === 'YES' ? bet : 0),
    pot.NO + (outcome === 'NO' ? bet : 0),
  ]
  const numerator = Math.pow(yesPot, 2)
  const denominator = Math.pow(yesPot, 2) + Math.pow(noPot, 2)
  return numerator / denominator
}

const getDpmWeight = (
  pot: { YES: number; NO: number },
  bet: number,
  betChoice: 'YES' | 'NO'
) => {
  const [yesPot, noPot] = [pot.YES, pot.NO]

  return betChoice === 'YES'
    ? (bet * Math.pow(noPot, 2)) / (Math.pow(yesPot, 2) + bet * yesPot)
    : (bet * Math.pow(yesPot, 2)) / (Math.pow(noPot, 2) + bet * noPot)
}
