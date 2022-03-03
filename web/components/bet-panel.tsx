import clsx from 'clsx'
import React, { useEffect, useState } from 'react'

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
import { firebaseLogin } from '../lib/firebase/users'
import { Bet } from '../../common/bet'
import { placeBet } from '../lib/firebase/api-call'
import { AmountInput } from './amount-input'
import { InfoTooltip } from './info-tooltip'
import { OutcomeLabel } from './outcome-label'
import {
  calculatePayoutAfterCorrectBet,
  calculateShares,
  getProbability,
  getOutcomeProbabilityAfterBet,
} from '../../common/calculate'
import { useFocus } from '../hooks/use-focus'

export function BetPanel(props: {
  contract: FullContract<DPM | CPMM, Binary>
  className?: string
  title?: string // Set if BetPanel is on a feed modal
  selected?: 'YES' | 'NO'
  onBetSuccess?: () => void
}) {
  useEffect(() => {
    // warm up cloud function
    placeBet({}).catch()
  }, [])

  const { contract, className, title, selected, onBetSuccess } = props

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
      if (onBetSuccess) onBetSuccess()
    } else {
      setError(result?.error || 'Error placing bet')
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
  const currentReturnPercent = (currentReturn * 100).toFixed() + '%'

  const panelTitle = title ?? 'Place a trade'
  if (title) {
    focusAmountInput()
  }

  const tooltip =
    contract.mechanism === 'dpm-2'
      ? `Current payout for ${formatWithCommas(shares)} / ${formatWithCommas(
          shares +
            contract.totalShares[betChoice ?? 'YES'] -
            (contract.phantomShares
              ? contract.phantomShares[betChoice ?? 'YES']
              : 0)
        )} ${betChoice} shares`
      : undefined

  return (
    <Col className={clsx('rounded-md bg-white px-8 py-6', className)}>
      <Title
        className={clsx('!mt-0', title ? '!text-xl' : '')}
        text={panelTitle}
      />

      <YesNoSelector
        className="mb-4"
        selected={betChoice}
        onSelect={(choice) => onBetChoice(choice)}
      />

      <div className="my-3 text-left text-sm text-gray-500">Amount </div>
      <AmountInput
        inputClassName="w-full"
        amount={betAmount}
        onChange={onBetChange}
        error={error}
        setError={setError}
        disabled={isSubmitting}
        inputRef={inputRef}
        contractId={contract.id}
      />

      <Col className="gap-3 mt-3 w-full">
        <Row className="justify-between items-center text-sm">
          <div className="text-gray-500">Probability</div>
          <Row>
            <div>{formatPercent(initialProb)}</div>
            <div className="mx-2">→</div>
            <div>{formatPercent(resultProb)}</div>
          </Row>
        </Row>

        <Row className="justify-between items-start text-sm gap-2">
          <Row className="flex-nowrap whitespace-nowrap items-center gap-2 text-gray-500">
            <div>
              Payout if <OutcomeLabel outcome={betChoice ?? 'YES'} />
            </div>

            {tooltip && <InfoTooltip text={tooltip} />}
          </Row>
          <Row className="flex-wrap justify-end items-end gap-2">
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
          {isSubmitting ? 'Submitting...' : 'Submit trade'}
        </button>
      )}
      {user === null && (
        <button
          className="btn flex-1 whitespace-nowrap border-none bg-gradient-to-r from-teal-500 to-green-500 px-10 text-lg font-medium normal-case hover:from-teal-600 hover:to-green-600"
          onClick={firebaseLogin}
        >
          Sign in to trade!
        </button>
      )}

      {wasSubmitted && <div className="mt-4">Trade submitted!</div>}
    </Col>
  )
}
