import clsx from 'clsx'
import React, { useEffect, useRef, useState } from 'react'

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
} from '../../common/util/format'
import { Title } from './title'
import {
  getProbability,
  calculateShares,
  getProbabilityAfterBet,
  calculatePayoutAfterCorrectBet,
} from '../../common/calculate'
import { firebaseLogin } from '../lib/firebase/users'
import { Bet } from '../../common/bet'
import { placeBet } from '../lib/firebase/api-call'
import { AmountInput } from './amount-input'
import { InfoTooltip } from './info-tooltip'
import { OutcomeLabel } from './outcome-label'

// Focus helper from https://stackoverflow.com/a/54159564/1222351
function useFocus(): [React.RefObject<HTMLElement>, () => void] {
  const htmlElRef = useRef<HTMLElement>(null)
  const setFocus = () => {
    htmlElRef.current && htmlElRef.current.focus()
  }

  return [htmlElRef, setFocus]
}

export function BetPanel(props: {
  contract: Contract
  className?: string
  title?: string // Set if BetPanel is on a feed modal
  selected?: 'YES' | 'NO'
}) {
  useEffect(() => {
    // warm up cloud function
    placeBet({}).catch()
  }, [])

  const { contract, className, title, selected } = props

  const user = useUser()

  const [betChoice, setBetChoice] = useState<'YES' | 'NO' | undefined>(selected)
  const [betAmount, setBetAmount] = useState<number | undefined>(undefined)
  const [inputRef, focusAmountInput] = useFocus()

  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [wasSubmitted, setWasSubmitted] = useState(false)

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

  const initialProb = getProbability(contract.totalShares)

  const resultProb = getProbabilityAfterBet(
    contract.totalShares,
    betChoice || 'YES',
    betAmount ?? 0
  )

  const shares = calculateShares(
    contract.totalShares,
    betAmount ?? 0,
    betChoice || 'YES'
  )

  const currentPayout = betAmount
    ? calculatePayoutAfterCorrectBet(contract, {
        outcome: betChoice,
        amount: betAmount,
        shares,
      } as Bet)
    : 0

  const currentReturn = betAmount ? (currentPayout - betAmount) / betAmount : 0
  const currentReturnPercent = (currentReturn * 100).toFixed() + '%'
  const panelTitle = title ?? 'Place a trade'
  if (title) {
    focusAmountInput()
  }

  return (
    <Col className={clsx('bg-white px-8 py-6 rounded-md', className)}>
      <Title
        className={clsx('!mt-0', title ? '!text-xl' : '')}
        text={panelTitle}
      />

      {/* <div className="mt-2 mb-1 text-sm text-gray-500">Outcome</div> */}
      <YesNoSelector
        className="mb-4"
        selected={betChoice}
        onSelect={(choice) => onBetChoice(choice)}
      />

      <div className="my-3 text-sm text-gray-500 text-left">Amount </div>
      <AmountInput
        inputClassName="w-full"
        amount={betAmount}
        onChange={onBetChange}
        error={error}
        setError={setError}
        disabled={isSubmitting}
        inputRef={inputRef}
      />

      <Spacer h={4} />

      <div className="mt-2 mb-1 text-sm text-gray-500">Implied probability</div>
      <Row>
        <div>{formatPercent(initialProb)}</div>
        <div className="mx-2">→</div>
        <div>{formatPercent(resultProb)}</div>
      </Row>

      {betChoice && (
        <>
          <Spacer h={4} />
          <Row className="mt-2 mb-1 items-center gap-2 text-sm text-gray-500">
            Payout if <OutcomeLabel outcome={betChoice} />
            <InfoTooltip
              text={`Current payout for ${formatWithCommas(
                shares
              )} / ${formatWithCommas(
                shares +
                  contract.totalShares[betChoice] -
                  contract.phantomShares[betChoice]
              )} ${betChoice} shares`}
            />
          </Row>
          <div>
            {formatMoney(currentPayout)}
            &nbsp; <span>(+{currentReturnPercent})</span>
          </div>
        </>
      )}

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
