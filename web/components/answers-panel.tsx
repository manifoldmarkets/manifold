import clsx from 'clsx'
import { useState } from 'react'
import Textarea from 'react-expanding-textarea'

import { Answer } from '../../common/answer'
import { Contract } from '../../common/contract'
import { AmountInput } from './amount-input'
import { Col } from './layout/col'
import { createAnswer } from '../lib/firebase/api-call'

export function AnswersPanel(props: {
  contract: Contract<'MULTI'>
  answers: Answer[]
}) {
  const { contract, answers } = props

  return (
    <Col>
      <CreateAnswerInput contract={contract} />
      {answers.map((answer) => (
        <div>{answer.text}</div>
      ))}
    </Col>
  )
}

function CreateAnswerInput(props: { contract: Contract<'MULTI'> }) {
  const { contract } = props
  const [text, setText] = useState('')
  const [betAmount, setBetAmount] = useState<number | undefined>(10)
  const [amountError, setAmountError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const canSubmit = text && betAmount && !amountError && !isSubmitting

  const submitAnswer = async () => {
    if (canSubmit) {
      setIsSubmitting(true)
      console.log('submitting', { text, betAmount })
      const result = await createAnswer({
        contractId: contract.id,
        text,
        amount: betAmount,
      }).then((r) => r.data)

      console.log('submit complte', result)
      setIsSubmitting(false)

      if (result.status === 'success') {
        setText('')
        setBetAmount(10)
        setAmountError(undefined)
      }
    }
  }

  return (
    <Col className="gap-4">
      <div className="text-xl text-indigo-700">Add your answer</div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="textarea textarea-bordered w-full"
        placeholder="Type your answer..."
        rows={1}
        maxLength={10000}
      />
      <Col className="gap-2 justify-between self-end sm:flex-row">
        {text && (
          <Col className="gap-2">
            <div className="text-gray-500 text-sm">Bet amount</div>
            <AmountInput
              amount={betAmount}
              onChange={setBetAmount}
              error={amountError}
              setError={setAmountError}
              minimumAmount={10}
              disabled={isSubmitting}
            />
          </Col>
        )}
        <button
          className={clsx(
            'btn btn-sm self-start',
            canSubmit ? 'btn-outline' : 'btn-disabled'
          )}
          disabled={!canSubmit}
          onClick={submitAnswer}
        >
          Submit answer
        </button>
      </Col>
    </Col>
  )
}
