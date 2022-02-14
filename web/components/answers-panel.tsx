import clsx from 'clsx'
import { useState } from 'react'
import Textarea from 'react-expanding-textarea'

import { Answer } from '../../common/answer'
import { Contract } from '../../common/contract'
import { AmountInput } from './amount-input'
import { Col } from './layout/col'
import { createAnswer } from '../lib/firebase/api-call'
import { Row } from './layout/row'
import { Avatar } from './avatar'
import { SiteLink } from './site-link'
import { DateTimeTooltip } from './datetime-tooltip'
import dayjs from 'dayjs'
import { BuyButton } from './yes-no-selector'

export function AnswersPanel(props: {
  contract: Contract<'MULTI'>
  answers: Answer[]
}) {
  const { contract, answers } = props

  return (
    <Col className="gap-4">
      {answers.map((answer) => (
        <AnswerItem key={answer.id} answer={answer} contract={contract} />
      ))}
      <CreateAnswerInput contract={contract} />
    </Col>
  )
}

function AnswerItem(props: { answer: Answer; contract: Contract<'MULTI'> }) {
  const { answer, contract } = props
  const { username, avatarUrl, name, createdTime } = answer

  const createdDate = dayjs(createdTime).format('MMM D')

  return (
    <Col className="p-2 sm:flex-row">
      <Col className="gap-2 flex-1">
        <div>{answer.text}</div>

        <Row className="text-gray-500 text-sm gap-2 items-center">
          <SiteLink className="relative" href={`/${username}`}>
            <Row className="items-center gap-2">
              <Avatar avatarUrl={avatarUrl} size={6} />
              <div className="truncate">{name}</div>
            </Row>
          </SiteLink>

          <div className="">•</div>

          <div className="whitespace-nowrap">
            <DateTimeTooltip text="" time={contract.createdTime}>
              {createdDate}
            </DateTimeTooltip>
          </div>
        </Row>
      </Col>

      <BuyButton
        className="justify-end self-end flex-initial"
        onClick={() => {}}
      />
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
    <Col className="gap-4 mt-2">
      <Col className="sm:flex-row gap-8">
        <Col className="flex-1 gap-2">
          <div className="text-gray-500 text-sm mb-1">Add your answer</div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="textarea textarea-bordered w-full"
            placeholder="Type your answer..."
            rows={1}
            maxLength={10000}
          />
          <button
            className={clsx(
              'btn btn-sm self-end mt-2',
              canSubmit ? 'btn-outline' : 'btn-disabled'
            )}
            disabled={!canSubmit}
            onClick={submitAnswer}
          >
            Submit answer & bet
          </button>
        </Col>
        <Col className={clsx('gap-2', text ? 'visible' : 'invisible')}>
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
      </Col>
    </Col>
  )
}
