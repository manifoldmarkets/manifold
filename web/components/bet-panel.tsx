import { getFunctions, httpsCallable } from 'firebase/functions'
import clsx from 'clsx'
import React, { useState } from 'react'

import { useUser } from '../hooks/use-user'
import { Contract } from '../lib/firebase/contracts'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { Spacer } from './layout/spacer'
import { YesNoSelector } from './yes-no-selector'
import { formatMoney } from '../lib/util/format'
import { Title } from './title'

export function BetPanel(props: { contract: Contract; className?: string }) {
  const { contract, className } = props

  const user = useUser()

  const [betChoice, setBetChoice] = useState<'YES' | 'NO'>('YES')
  const [betAmount, setBetAmount] = useState<number | undefined>(undefined)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [wasSubmitted, setWasSubmitted] = useState(false)

  function onBetChoice(choice: 'YES' | 'NO') {
    setBetChoice(choice)
    setWasSubmitted(false)
  }

  function onBetChange(str: string) {
    const amount = parseInt(str)
    setBetAmount(isNaN(amount) ? undefined : amount)

    setWasSubmitted(false)
  }

  async function submitBet() {
    if (!user || !betAmount) return

    setIsSubmitting(true)

    const result = await placeBet({
      amount: betAmount,
      outcome: betChoice,
      contractId: contract.id,
    })
    console.log('placed bet. Result:', result)

    setIsSubmitting(false)
    setWasSubmitted(true)
    setBetAmount(undefined)
  }

  const betDisabled = isSubmitting || !betAmount

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
      <Title className="mt-0" text="Place a bet" />
      <div className="pt-2 pb-1 text-sm text-gray-500">Outcome</div>
      <YesNoSelector
        className="p-2"
        selected={betChoice}
        onSelect={(choice) => onBetChoice(choice)}
      />

      <Spacer h={4} />

      <div className="pt-2 pb-1 text-sm text-gray-500">Bet amount</div>
      <Row className="p-2 items-center relative">
        <div className="absolute inset-y-0 left-2 pl-3 flex items-center pointer-events-none">
          <span className="text-gray-500 sm:text-sm">M$</span>
        </div>
        <input
          className="input input-bordered input-md pl-10 block"
          style={{ maxWidth: 100 }}
          type="text"
          placeholder="0"
          value={betAmount ?? ''}
          onChange={(e) => onBetChange(e.target.value)}
        />
      </Row>

      <Spacer h={4} />

      <div className="pt-2 pb-1 text-sm text-gray-500">Implied probability</div>
      <Row>
        <div className="px-2 font-sans">
          {Math.round(initialProb * 100) + '%'}
        </div>
        <div>→</div>
        <div className="px-2 font-sans">
          {Math.round(resultProb * 100) + '%'}
        </div>
      </Row>

      <Spacer h={2} />

      <div className="pt-2 pb-1 text-sm text-gray-500">Estimated winnings</div>
      <div className="px-2 font-sans">
        {formatMoney(estimatedWinnings)} (+{estimatedReturnPercent})
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
