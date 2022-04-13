import clsx from 'clsx'
import _ from 'lodash'
import { useState } from 'react'
import Textarea from 'react-expanding-textarea'

import { DPM, FreeResponse, FullContract } from '../../../common/contract'
import { BuyAmountInput } from '../amount-input'
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
  calculateDpmShares,
  calculateDpmPayoutAfterCorrectBet,
  getDpmOutcomeProbabilityAfterBet,
} from '../../../common/calculate-dpm'
import { firebaseLogin } from '../../lib/firebase/users'
import { Bet } from '../../../common/bet'

export function CreateAnswerPanel(props: {
  contract: FullContract<DPM, FreeResponse>
}) {
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
      } else setAmountError(result.message)
    }
  }

  const resultProb = getDpmOutcomeProbabilityAfterBet(
    contract.totalShares,
    'new',
    betAmount ?? 0
  )

  const shares = calculateDpmShares(contract.totalShares, betAmount ?? 0, 'new')

  const currentPayout = betAmount
    ? calculateDpmPayoutAfterCorrectBet(contract, {
        outcome: 'new',
        amount: betAmount,
        shares,
      } as Bet)
    : 0

  const currentReturn = betAmount ? (currentPayout - betAmount) / betAmount : 0
  const currentReturnPercent = (currentReturn * 100).toFixed() + '%'

  return (
    <Col className="gap-4 rounded bg-gray-50 p-4">
      <Col className="flex-1 gap-2">
        <div className="mb-1">Add your answer</div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="textarea textarea-bordered w-full resize-none"
          placeholder="Type your answer..."
          rows={1}
          maxLength={10000}
        />
        <div />
        <Col
          className={clsx(
            'gap-4 sm:flex-row sm:items-end',
            text ? 'justify-between' : 'self-end'
          )}
        >
          {text && (
            <>
              <Col className="mt-1 gap-2">
                <div className="text-sm text-gray-500">Bet amount</div>
                <BuyAmountInput
                  amount={betAmount}
                  onChange={setBetAmount}
                  error={amountError}
                  setError={setAmountError}
                  minimumAmount={1}
                  disabled={isSubmitting}
                />
              </Col>
              <Col className="gap-3">
                <Row className="items-center justify-between text-sm">
                  <div className="text-gray-500">Probability</div>
                  <Row>
                    <div>{formatPercent(0)}</div>
                    <div className="mx-2">→</div>
                    <div>{formatPercent(resultProb)}</div>
                  </Row>
                </Row>

                <Row className="items-center justify-between gap-4 text-sm">
                  <Row className="flex-nowrap items-center gap-2 whitespace-nowrap text-gray-500">
                    <div>
                      Estimated <br /> payout if chosen
                    </div>
                    <InfoTooltip
                      text={`Current payout for ${formatWithCommas(
                        shares
                      )} / ${formatWithCommas(shares)} shares`}
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
            </>
          )}
          {user ? (
            <button
              className={clsx(
                'btn mt-2',
                canSubmit ? 'btn-outline' : 'btn-disabled',
                isSubmitting && 'loading'
              )}
              disabled={!canSubmit}
              onClick={submitAnswer}
            >
              Submit answer & buy
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
