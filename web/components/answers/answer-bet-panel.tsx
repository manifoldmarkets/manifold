import clsx from 'clsx'
import _ from 'lodash'
import { useEffect, useRef, useState } from 'react'
import { XIcon } from '@heroicons/react/solid'

import { Answer } from '../../../common/answer'
import { DPM, FreeResponse, FullContract } from '../../../common/contract'
import { BuyAmountInput } from '../amount-input'
import { Col } from '../layout/col'
import { placeBet } from '../../lib/firebase/api-call'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'
import {
  formatMoney,
  formatPercent,
  formatWithCommas,
} from '../../../common/util/format'
import { InfoTooltip } from '../info-tooltip'
import { useUser } from '../../hooks/use-user'
import {
  getDpmOutcomeProbability,
  calculateDpmShares,
  calculateDpmPayoutAfterCorrectBet,
  getDpmOutcomeProbabilityAfterBet,
} from '../../../common/calculate-dpm'
import { firebaseLogin } from '../../lib/firebase/users'
import { Bet } from '../../../common/bet'

export function AnswerBetPanel(props: {
  answer: Answer
  contract: FullContract<DPM, FreeResponse>
  closePanel: () => void
  className?: string
  isModal?: boolean
}) {
  const { answer, contract, closePanel, className, isModal } = props
  const { id: answerId } = answer

  const user = useUser()
  const [betAmount, setBetAmount] = useState<number | undefined>(undefined)

  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const inputRef = useRef<HTMLElement>(null)
  useEffect(() => {
    inputRef.current && inputRef.current.focus()
  }, [])

  async function submitBet() {
    if (!user || !betAmount) return

    setError(undefined)
    setIsSubmitting(true)

    const result = await placeBet({
      amount: betAmount,
      outcome: answerId,
      contractId: contract.id,
    }).then((r) => r.data as any)

    console.log('placed bet. Result:', result)

    if (result?.status === 'success') {
      setIsSubmitting(false)
      setBetAmount(undefined)
      props.closePanel()
    } else {
      setError(result?.error || 'Error placing bet')
      setIsSubmitting(false)
    }
  }

  const betDisabled = isSubmitting || !betAmount || error

  const initialProb = getDpmOutcomeProbability(contract.totalShares, answer.id)

  const resultProb = getDpmOutcomeProbabilityAfterBet(
    contract.totalShares,
    answerId,
    betAmount ?? 0
  )

  const shares = calculateDpmShares(
    contract.totalShares,
    betAmount ?? 0,
    answerId
  )

  const currentPayout = betAmount
    ? calculateDpmPayoutAfterCorrectBet(contract, {
        outcome: answerId,
        amount: betAmount,
        shares,
      } as Bet)
    : 0

  const currentReturn = betAmount ? (currentPayout - betAmount) / betAmount : 0
  const currentReturnPercent = formatPercent(currentReturn)

  return (
    <Col className={clsx('px-2 pb-2 pt-4 sm:pt-0', className)}>
      <Row className="items-center justify-between self-stretch">
        <div className="text-xl">
          Bet on {isModal ? `"${answer.text}"` : 'this answer'}
        </div>

        {!isModal && (
          <button className="btn-ghost btn-circle" onClick={closePanel}>
            <XIcon
              className="mx-auto h-8 w-8 text-gray-500"
              aria-hidden="true"
            />
          </button>
        )}
      </Row>
      <div className="my-3 text-left text-sm text-gray-500">Amount </div>
      <BuyAmountInput
        inputClassName="w-full max-w-none"
        amount={betAmount}
        onChange={setBetAmount}
        error={error}
        setError={setError}
        disabled={isSubmitting}
        inputRef={inputRef}
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
              Estimated <br /> payout if chosen
            </div>
            <InfoTooltip
              text={`Current payout for ${formatWithCommas(
                shares
              )} / ${formatWithCommas(
                shares + contract.totalShares[answerId]
              )} shares`}
            />
          </Row>
          <Row className="flex-wrap items-end justify-end gap-2">
            <span className="whitespace-nowrap">
              {formatMoney(currentPayout)}
            </span>
            <span>(+{currentReturnPercent})</span>
          </Row>
        </Row>
      </Col>

      <Spacer h={6} />

      {user ? (
        <button
          className={clsx(
            'btn self-stretch',
            betDisabled ? 'btn-disabled' : 'btn-primary',
            isSubmitting ? 'loading' : ''
          )}
          onClick={betDisabled ? undefined : submitBet}
        >
          {isSubmitting ? 'Submitting...' : 'Submit trade'}
        </button>
      ) : (
        <button
          className="btn self-stretch whitespace-nowrap border-none bg-gradient-to-r from-teal-500 to-green-500 px-10 text-lg font-medium normal-case hover:from-teal-600 hover:to-green-600"
          onClick={firebaseLogin}
        >
          Sign up to trade!
        </button>
      )}
    </Col>
  )
}
