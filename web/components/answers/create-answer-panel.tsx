import clsx from 'clsx'
import _ from 'lodash'
import { useState } from 'react'
import Textarea from 'react-expanding-textarea'

import {
  Contract,
  DPM,
  FreeResponse,
  FullContract,
} from '../../../common/contract'
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
  getDpmProbabilityAfterBet,
  calculateDpmShares,
  calculateDpmPayoutAfterCorrectBet,
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
      }
    }
  }

  const resultProb = getDpmProbabilityAfterBet(
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
            'sm:flex-row sm:items-end gap-4',
            text ? 'justify-between' : 'self-end'
          )}
        >
          {text && (
            <>
              <Col className="gap-2 mt-1">
                <div className="text-gray-500 text-sm">Buy amount</div>
                <AmountInput
                  amount={betAmount}
                  onChange={setBetAmount}
                  error={amountError}
                  setError={setAmountError}
                  minimumAmount={1}
                  disabled={isSubmitting}
                  contractId={contract.id}
                />
              </Col>
              <Col className="gap-3">
                <Row className="justify-between items-center text-sm">
                  <div className="text-gray-500">Probability</div>
                  <Row>
                    <div>{formatPercent(0)}</div>
                    <div className="mx-2">→</div>
                    <div>{formatPercent(resultProb)}</div>
                  </Row>
                </Row>

                <Row className="justify-between text-sm gap-2">
                  <Row className="flex-nowrap whitespace-nowrap items-center gap-2 text-gray-500">
                    <div>Payout if chosen</div>
                    <InfoTooltip
                      text={`Current payout for ${formatWithCommas(
                        shares
                      )} / ${formatWithCommas(shares)} shares`}
                    />
                  </Row>
                  <Row className="flex-wrap justify-end items-end gap-2">
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
