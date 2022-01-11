import clsx from 'clsx'
import React, { useEffect, useState } from 'react'

import { useUser } from '../hooks/use-user'
import { Contract } from '../../common/contract'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { Spacer } from './layout/spacer'
import { YesNoSelector } from './yes-no-selector'
import {
  formatMoney,
  formatPercent,
  formatWithCommas,
} from '../lib/util/format'
import { Title } from './title'
import {
  getProbability,
  calculateShares,
  getProbabilityAfterBet,
  calculatePayoutAfterCorrectBet,
} from '../../common/calculate'
import { firebaseLogin } from '../lib/firebase/users'
import { OutcomeLabel } from './outcome-label'
import { AdvancedPanel } from './advanced-panel'
import { Bet } from '../../common/bet'
import { placeBet } from '../lib/firebase/api-call'
import { AmountInput } from './amount-input'

export function BetPanel(props: { contract: Contract; className?: string }) {
  useEffect(() => {
    // warm up cloud function
    placeBet({}).catch()
  }, [])

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

  function onBetChange(newAmount: number | undefined) {
    setWasSubmitted(false)
    setBetAmount(newAmount)
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
    }).then((r) => r.data as any)

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

  const initialProb = getProbability(contract.pool)
  const resultProb = getProbabilityAfterBet(
    contract.totalShares,
    betChoice,
    betAmount ?? 0
  )
  const shares = calculateShares(contract.pool, betAmount ?? 0, betChoice)

  const estimatedWinnings = Math.floor(shares)
  const estimatedReturn = betAmount
    ? (estimatedWinnings - betAmount) / betAmount
    : 0
  const estimatedReturnPercent = (estimatedReturn * 100).toFixed() + '%'

  return (
    <Col
      className={clsx('bg-gray-100 shadow-md px-8 py-6 rounded-md', className)}
    >
      <Title className="!mt-0 whitespace-nowrap" text={`Buy ${betChoice}`} />

      <div className="mt-2 mb-1 text-sm text-gray-500">Outcome</div>
      <YesNoSelector
        className="my-2"
        selected={betChoice}
        onSelect={(choice) => onBetChoice(choice)}
      />

      <div className="my-3 text-sm text-gray-500">Amount </div>
      <AmountInput
        inputClassName="w-full"
        amount={betAmount}
        onChange={onBetChange}
        error={error}
        setError={setError}
        disabled={isSubmitting}
      />

      <Spacer h={4} />

      <div className="mt-2 mb-1 text-sm text-gray-500">Implied probability</div>
      <Row>
        <div>{formatPercent(initialProb)}</div>
        <div className="mx-2">→</div>
        <div>{formatPercent(resultProb)}</div>
      </Row>

      <div className="mt-2 mb-1 text-sm text-gray-500">
        Estimated max payout
      </div>
      <div>
        {formatMoney(estimatedWinnings)} &nbsp;{' '}
        {estimatedWinnings ? <span>(+{estimatedReturnPercent})</span> : null}
      </div>

      <AdvancedPanel>
        <div className="mt-2 mb-1 text-sm text-gray-500">
          <OutcomeLabel outcome={betChoice} /> shares
        </div>
        <div>
          {formatWithCommas(shares)} of{' '}
          {formatWithCommas(shares + contract.totalShares[betChoice])}
        </div>

        <div className="mt-2 mb-1 text-sm text-gray-500">
          Current payout if <OutcomeLabel outcome={betChoice} />
        </div>
        <div>
          {formatMoney(
            betAmount
              ? calculatePayoutAfterCorrectBet(contract, {
                  outcome: betChoice,
                  amount: betAmount,
                  shares,
                } as Bet)
              : 0
          )}
        </div>
      </AdvancedPanel>

      <Spacer h={6} />

      {user ? (
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
          {isSubmitting ? 'Submitting...' : 'Submit trade'}
        </button>
      ) : (
        <button
          className="btn mt-4 border-none normal-case text-lg font-medium whitespace-nowrap px-10 bg-gradient-to-r from-teal-500 to-green-500 hover:from-teal-600 hover:to-green-600"
          onClick={firebaseLogin}
        >
          Sign in to trade!
        </button>
      )}

      {wasSubmitted && <div className="mt-4">Trade submitted!</div>}
    </Col>
  )
}
