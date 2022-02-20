import clsx from 'clsx'
import _ from 'lodash'
import { useState } from 'react'
import Textarea from 'react-expanding-textarea'

import { Contract } from '../../../common/contract'
import { AmountInput } from '../amount-input'
import { Col } from '../layout/col'
import { createAnswer } from '../../lib/firebase/api-call'
import { Row } from '../layout/row'
import {
  formatMoney,
  formatPercent,
  formatWithCommas,
} from '../../../common/util/format'
import { InfoTooltip } from '../info-tooltip'
import { useUser } from '../../hooks/use-user'
import {
  getProbabilityAfterBet,
  calculateShares,
  calculatePayoutAfterCorrectBet,
} from '../../../common/calculate'
import { firebaseLogin } from '../../lib/firebase/users'
import { Bet } from '../../../common/bet'

export function CreateAnswerPanel(props: { contract: Contract }) {
  const { contract } = props
  const user = useUser()
  const [text, setText] = useState('')
  const [betAmount, setBetAmount] = useState<number | undefined>(10)
  const [amountError, setAmountError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const canSubmit = text && betAmount && !amountError && !isSubmitting

  const submitAnswer = async () => {
    if (canSubmit) {
      setIsSubmitting(true)
      const result = await createAnswer({
        contractId: contract.id,
        text,
        amount: betAmount,
      }).then((r) => r.data)

      setIsSubmitting(false)

      if (result.status === 'success') {
        setText('')
        setBetAmount(10)
        setAmountError(undefined)
      }
    }
  }

  const resultProb = getProbabilityAfterBet(
    contract.totalShares,
    'new',
    betAmount ?? 0
  )

  const shares = calculateShares(contract.totalShares, betAmount ?? 0, 'new')

  const currentPayout = betAmount
    ? calculatePayoutAfterCorrectBet(contract, {
        outcome: 'new',
        amount: betAmount,
        shares,
      } as Bet)
    : 0

  const currentReturn = betAmount ? (currentPayout - betAmount) / betAmount : 0
  const currentReturnPercent = (currentReturn * 100).toFixed() + '%'

  return (
    <Col className="gap-4 p-4 bg-gray-50 rounded">
      <Col className="flex-1 gap-2">
        <div className="mb-1">Add your answer</div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="textarea textarea-bordered w-full"
          placeholder="Type your answer..."
          rows={1}
          maxLength={10000}
        />
        <div />
        <Col
          className={clsx(
            'sm:flex-row gap-4',
            text ? 'justify-between' : 'self-end'
          )}
        >
          {text && (
            <>
              <Col className="gap-2 mt-1">
                <div className="text-gray-500 text-sm">
                  Ante (cannot be sold)
                </div>
                <AmountInput
                  amount={betAmount}
                  onChange={setBetAmount}
                  error={amountError}
                  setError={setAmountError}
                  minimumAmount={10}
                  disabled={isSubmitting}
                />
              </Col>
              <Col className="gap-2 mt-1">
                <div className="text-sm text-gray-500">Implied probability</div>
                <Row>
                  <div>{formatPercent(0)}</div>
                  <div className="mx-2">→</div>
                  <div>{formatPercent(resultProb)}</div>
                </Row>
                <Row className="mt-2 mb-1 items-center gap-2 text-sm text-gray-500">
                  Payout if chosen
                  <InfoTooltip
                    text={`Current payout for ${formatWithCommas(
                      shares
                    )} / ${formatWithCommas(shares)} shares`}
                  />
                </Row>
                <div>
                  {formatMoney(currentPayout)}
                  &nbsp; <span>(+{currentReturnPercent})</span>
                </div>
              </Col>
            </>
          )}
          {user ? (
            <button
              className={clsx(
                'btn self-end mt-2',
                canSubmit ? 'btn-outline' : 'btn-disabled',
                isSubmitting && 'loading'
              )}
              disabled={!canSubmit}
              onClick={submitAnswer}
            >
              Submit answer & bet
            </button>
          ) : (
            text && (
              <button
                className="btn self-end whitespace-nowrap border-none bg-gradient-to-r from-teal-500 to-green-500 px-10 text-lg font-medium normal-case hover:from-teal-600 hover:to-green-600"
                onClick={firebaseLogin}
              >
                Sign in
              </button>
            )
          )}
        </Col>
      </Col>
    </Col>
  )
}
