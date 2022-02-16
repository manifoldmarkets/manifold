import clsx from 'clsx'
import _ from 'lodash'
import { useEffect, useRef, useState } from 'react'
import Textarea from 'react-expanding-textarea'
import { XIcon } from '@heroicons/react/solid'

import { Answer } from '../../common/answer'
import { Contract } from '../../common/contract'
import { AmountInput } from './amount-input'
import { Col } from './layout/col'
import { createAnswer, placeBet, resolveMarket } from '../lib/firebase/api-call'
import { Row } from './layout/row'
import { Avatar } from './avatar'
import { SiteLink } from './site-link'
import { DateTimeTooltip } from './datetime-tooltip'
import dayjs from 'dayjs'
import { BuyButton, ChooseCancelSelector } from './yes-no-selector'
import { Spacer } from './layout/spacer'
import {
  formatMoney,
  formatPercent,
  formatWithCommas,
} from '../../common/util/format'
import { InfoTooltip } from './info-tooltip'
import { useUser } from '../hooks/use-user'
import {
  getProbabilityAfterBet,
  getOutcomeProbability,
  calculateShares,
  calculatePayoutAfterCorrectBet,
} from '../../common/calculate'
import { firebaseLogin } from '../lib/firebase/users'
import { Bet } from '../../common/bet'
import { useAnswers } from '../hooks/use-answers'
import { ResolveConfirmationButton } from './confirmation-button'

export function AnswersPanel(props: {
  contract: Contract<'MULTI'>
  answers: Answer[]
}) {
  const { contract } = props

  const answers = useAnswers(contract.id) ?? props.answers
  const sortedAnswers = _.sortBy(
    answers,
    (answer) => -1 * getOutcomeProbability(contract.totalShares, answer.id)
  )

  const user = useUser()

  const [resolveOption, setResolveOption] = useState<
    'CHOOSE' | 'CANCEL' | undefined
  >()
  const [answerChoice, setAnswerChoice] = useState<string | undefined>()

  return (
    <Col className="gap-3">
      {sortedAnswers.map((answer) => (
        <AnswerItem
          key={answer.id}
          answer={answer}
          contract={contract}
          showChoice={resolveOption === 'CHOOSE'}
          isChosen={answer.id === answerChoice}
          onChoose={() => setAnswerChoice(answer.id)}
        />
      ))}

      <CreateAnswerInput contract={contract} />

      {user?.id === contract.creatorId && (
        <AnswerResolvePanel
          contract={contract}
          resolveOption={resolveOption}
          setResolveOption={setResolveOption}
          answer={answerChoice}
          clearAnswerChoice={() => setAnswerChoice(undefined)}
        />
      )}
    </Col>
  )
}

function AnswerItem(props: {
  answer: Answer
  contract: Contract<'MULTI'>
  showChoice: boolean
  isChosen: boolean
  onChoose: () => void
}) {
  const { answer, contract, showChoice, isChosen, onChoose } = props
  const { username, avatarUrl, name, createdTime, number, text } = answer

  const createdDate = dayjs(createdTime).format('MMM D')
  const prob = getOutcomeProbability(contract.totalShares, answer.id)
  const probPercent = formatPercent(prob)

  const [isBetting, setIsBetting] = useState(false)

  return (
    <Col className="p-4 sm:flex-row bg-gray-50 rounded">
      <Col className="gap-3 flex-1">
        <div>{text}</div>

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
          <div className="">•</div>
          <div className="text-base">#{number}</div>
        </Row>
      </Col>

      {isBetting ? (
        <AnswerBetPanel
          answer={answer}
          contract={contract}
          closePanel={() => setIsBetting(false)}
        />
      ) : (
        <Row className="self-end sm:self-start items-center gap-4">
          <div className="text-2xl text-green-500">{probPercent}</div>
          {showChoice ? (
            <div className="form-control py-1">
              <label className="cursor-pointer label gap-2">
                <span className="label-text">Choose this answer</span>
                <input
                  className={clsx('radio', isChosen && '!bg-green-500')}
                  type="radio"
                  name="opt"
                  checked={isChosen}
                  onChange={onChoose}
                  value={answer.id}
                />
              </label>
            </div>
          ) : (
            <BuyButton
              className="justify-end self-end flex-initial btn-md !px-8"
              onClick={() => {
                setIsBetting(true)
              }}
            />
          )}
        </Row>
      )}
    </Col>
  )
}

function AnswerBetPanel(props: {
  answer: Answer
  contract: Contract<'MULTI'>
  closePanel: () => void
}) {
  const { answer, contract, closePanel } = props
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

    if (user.balance < betAmount) {
      setError('Insufficient balance')
      return
    }

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
      closePanel()
    } else {
      setError(result?.error || 'Error placing bet')
      setIsSubmitting(false)
    }
  }

  const betDisabled = isSubmitting || !betAmount || error

  const initialProb = getOutcomeProbability(contract.totalShares, answer.id)

  const resultProb = getProbabilityAfterBet(
    contract.totalShares,
    answerId,
    betAmount ?? 0
  )

  const shares = calculateShares(contract.totalShares, betAmount ?? 0, answerId)

  const currentPayout = betAmount
    ? calculatePayoutAfterCorrectBet(
        contract as any as Contract,
        {
          outcome: answerId,
          amount: betAmount,
          shares,
        } as Bet
      )
    : 0

  const currentReturn = betAmount ? (currentPayout - betAmount) / betAmount : 0
  const currentReturnPercent = (currentReturn * 100).toFixed() + '%'

  return (
    <Col className="items-start px-2 pb-2 pt-4 sm:pt-0">
      <Row className="self-stretch items-center justify-between">
        <div className="text-xl">Buy this answer</div>

        <button className="btn-ghost btn-circle" onClick={closePanel}>
          <XIcon className="w-8 h-8 text-gray-500 mx-auto" aria-hidden="true" />
        </button>
      </Row>
      <div className="my-3 text-left text-sm text-gray-500">Amount </div>
      <AmountInput
        inputClassName="w-full"
        amount={betAmount}
        onChange={setBetAmount}
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

      <Spacer h={4} />

      <Row className="mt-2 mb-1 items-center gap-2 text-sm text-gray-500">
        Payout if chosen
        <InfoTooltip
          text={`Current payout for ${formatWithCommas(
            shares
          )} / ${formatWithCommas(
            shares + contract.totalShares[answerId]
          )} shares`}
        />
      </Row>
      <div>
        {formatMoney(currentPayout)}
        &nbsp; <span>(+{currentReturnPercent})</span>
      </div>

      <Spacer h={6} />

      {user ? (
        <button
          className={clsx(
            'btn',
            betDisabled ? 'btn-disabled' : 'btn-primary',
            isSubmitting ? 'loading' : ''
          )}
          onClick={betDisabled ? undefined : submitBet}
        >
          {isSubmitting ? 'Submitting...' : 'Submit trade'}
        </button>
      ) : (
        <button
          className="btn mt-4 whitespace-nowrap border-none bg-gradient-to-r from-teal-500 to-green-500 px-10 text-lg font-medium normal-case hover:from-teal-600 hover:to-green-600"
          onClick={firebaseLogin}
        >
          Sign in to trade!
        </button>
      )}
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
          className={clsx('sm:flex-row', text ? 'justify-between' : 'self-end')}
        >
          {text && (
            <Col className="gap-2 mt-1">
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
              'btn btn-sm self-end mt-2',
              canSubmit ? 'btn-outline' : 'btn-disabled'
            )}
            disabled={!canSubmit}
            onClick={submitAnswer}
          >
            Submit answer & bet
          </button>
        </Col>
      </Col>
    </Col>
  )
}

function AnswerResolvePanel(props: {
  contract: Contract<'MULTI'>
  resolveOption: 'CHOOSE' | 'CANCEL' | undefined
  setResolveOption: (option: 'CHOOSE' | 'CANCEL' | undefined) => void
  answer: string | undefined
  clearAnswerChoice: () => void
}) {
  const {
    contract,
    resolveOption,
    setResolveOption,
    answer,
    clearAnswerChoice,
  } = props

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const onResolve = async () => {
    if (answer === undefined) return

    setIsSubmitting(true)

    const result = await resolveMarket({
      outcome: answer,
      contractId: contract.id,
    }).then((r) => r.data as any)

    console.log('resolved', `#${answer}`, 'result:', result)

    if (result?.status !== 'success') {
      setError(result?.error || 'Error resolving market')
    }
    setIsSubmitting(false)
  }

  const resolutionButtonClass =
    resolveOption === 'CANCEL'
      ? 'bg-yellow-400 hover:bg-yellow-500'
      : resolveOption === 'CHOOSE' && answer
      ? 'btn-primary'
      : 'btn-disabled'

  return (
    <Col className="gap-4 p-4 bg-gray-50 rounded">
      <div>Resolve your market</div>
      <Col className="sm:flex-row sm:items-center gap-2">
        <ChooseCancelSelector
          className="!flex-row flex-wrap items-center"
          selected={resolveOption}
          onSelect={setResolveOption}
        />

        <Row
          className={clsx(
            'flex-1 items-center',
            resolveOption ? 'justify-between' : 'justify-end'
          )}
        >
          {resolveOption && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                setResolveOption(undefined)
                clearAnswerChoice()
              }}
            >
              Clear
            </button>
          )}
          <ResolveConfirmationButton
            onResolve={onResolve}
            isSubmitting={isSubmitting}
            openModelButtonClass={resolutionButtonClass}
            submitButtonClass={resolutionButtonClass}
          />
        </Row>
      </Col>

      {!!error && <div className="text-red-500">{error}</div>}
    </Col>
  )
}
