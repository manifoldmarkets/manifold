import clsx from 'clsx'
import _ from 'lodash'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
import { tradingAllowed } from '../lib/firebase/contracts'
import { removeUndefinedProps } from '../../common/util/object'

export function AnswersPanel(props: { contract: Contract; answers: Answer[] }) {
  const { contract } = props
  const { creatorId, resolution, resolutions } = contract

  const answers = useAnswers(contract.id) ?? props.answers
  const [winningAnswers, otherAnswers] = _.partition(
    answers.filter((answer) => answer.id !== '0'),
    (answer) =>
      answer.id === resolution || (resolutions && resolutions[answer.id])
  )
  const sortedAnswers = [
    ..._.sortBy(winningAnswers, (answer) =>
      resolutions ? -1 * resolutions[answer.id] : 0
    ),
    ..._.sortBy(
      otherAnswers,
      (answer) => -1 * getOutcomeProbability(contract.totalShares, answer.id)
    ),
  ]

  const user = useUser()

  const [resolveOption, setResolveOption] = useState<
    'CHOOSE' | 'CHOOSE_MULTIPLE' | 'CANCEL' | undefined
  >()
  const [chosenAnswers, setChosenAnswers] = useState<{
    [answerId: string]: number
  }>({})

  const chosenTotal = _.sum(Object.values(chosenAnswers))

  const onChoose = (answerId: string, prob: number) => {
    if (resolveOption === 'CHOOSE') {
      setChosenAnswers({ [answerId]: prob })
    } else {
      setChosenAnswers((chosenAnswers) => {
        return {
          ...chosenAnswers,
          [answerId]: prob,
        }
      })
    }
  }

  const onDeselect = (answerId: string) => {
    setChosenAnswers((chosenAnswers) => {
      const newChosenAnswers = { ...chosenAnswers }
      delete newChosenAnswers[answerId]
      return newChosenAnswers
    })
  }

  useLayoutEffect(() => {
    setChosenAnswers({})
  }, [resolveOption])

  const showChoice = resolution
    ? undefined
    : resolveOption === 'CHOOSE'
    ? 'radio'
    : resolveOption === 'CHOOSE_MULTIPLE'
    ? 'checkbox'
    : undefined

  return (
    <Col className="gap-3">
      {sortedAnswers.map((answer) => (
        <AnswerItem
          key={answer.id}
          answer={answer}
          contract={contract}
          showChoice={showChoice}
          chosenProb={chosenAnswers[answer.id]}
          totalChosenProb={chosenTotal}
          onChoose={onChoose}
          onDeselect={onDeselect}
        />
      ))}

      {sortedAnswers.length === 0 ? (
        <div className="text-gray-500 p-4">No answers yet...</div>
      ) : (
        <div className="text-gray-500 self-end p-4">
          None of the above:{' '}
          {formatPercent(getOutcomeProbability(contract.totalShares, '0'))}
        </div>
      )}

      {tradingAllowed(contract) && !resolveOption && (
        <CreateAnswerInput contract={contract} />
      )}

      {user?.id === creatorId && !resolution && (
        <AnswerResolvePanel
          contract={contract}
          resolveOption={resolveOption}
          setResolveOption={setResolveOption}
          chosenAnswers={chosenAnswers}
        />
      )}
    </Col>
  )
}

function AnswerItem(props: {
  answer: Answer
  contract: Contract
  showChoice: 'radio' | 'checkbox' | undefined
  chosenProb: number | undefined
  totalChosenProb?: number
  onChoose: (answerId: string, prob: number) => void
  onDeselect: (answerId: string) => void
}) {
  const {
    answer,
    contract,
    showChoice,
    chosenProb,
    totalChosenProb,
    onChoose,
    onDeselect,
  } = props
  const { resolution, resolutions, totalShares } = contract
  const { username, avatarUrl, name, createdTime, number, text } = answer
  const isChosen = chosenProb !== undefined

  const createdDate = dayjs(createdTime).format('MMM D')
  const prob = getOutcomeProbability(totalShares, answer.id)
  const roundedProb = Math.round(prob * 100)
  const probPercent = formatPercent(prob)
  const wasResolvedTo =
    resolution === answer.id || (resolutions && resolutions[answer.id])

  const [isBetting, setIsBetting] = useState(false)

  return (
    <Col
      className={clsx(
        'p-4 sm:flex-row rounded gap-4',
        wasResolvedTo
          ? resolution === 'MKT'
            ? 'bg-blue-50 mb-2'
            : 'bg-green-50 mb-8'
          : chosenProb === undefined
          ? 'bg-gray-50'
          : showChoice === 'radio'
          ? 'bg-green-50'
          : 'bg-blue-50'
      )}
    >
      <Col className="gap-3 flex-1">
        <div className="whitespace-pre-line break-words">{text}</div>

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
        <Row className="self-end sm:self-start items-center gap-4 justify-end">
          {!wasResolvedTo &&
            (showChoice === 'checkbox' ? (
              <input
                className="input input-bordered text-2xl justify-self-end w-24"
                type="number"
                placeholder={`${roundedProb}`}
                maxLength={9}
                value={chosenProb ? Math.round(chosenProb) : ''}
                onChange={(e) => {
                  const { value } = e.target
                  const numberValue = value
                    ? parseInt(value.replace(/[^\d]/, ''))
                    : 0
                  if (!isNaN(numberValue)) onChoose(answer.id, numberValue)
                }}
              />
            ) : (
              <div
                className={clsx(
                  'text-2xl',
                  tradingAllowed(contract) ? 'text-green-500' : 'text-gray-500'
                )}
              >
                {probPercent}
              </div>
            ))}
          {showChoice ? (
            <div className="form-control py-1">
              <label className="cursor-pointer label gap-3">
                <span className="">Choose this answer</span>
                {showChoice === 'radio' && (
                  <input
                    className={clsx('radio', chosenProb && '!bg-green-500')}
                    type="radio"
                    name="opt"
                    checked={isChosen}
                    onChange={() => onChoose(answer.id, 1)}
                    value={answer.id}
                  />
                )}
                {showChoice === 'checkbox' && (
                  <input
                    className={clsx('checkbox', chosenProb && '!bg-blue-500')}
                    type="checkbox"
                    name="opt"
                    checked={isChosen}
                    onChange={() => {
                      if (isChosen) onDeselect(answer.id)
                      else {
                        onChoose(answer.id, 100 * prob)
                      }
                    }}
                    value={answer.id}
                  />
                )}
              </label>
              {showChoice === 'checkbox' && (
                <div className="ml-1">
                  {chosenProb && totalChosenProb
                    ? Math.round((100 * chosenProb) / totalChosenProb)
                    : 0}
                  % share
                </div>
              )}
            </div>
          ) : (
            <>
              {tradingAllowed(contract) && (
                <BuyButton
                  className="justify-end self-end flex-initial btn-md !px-8"
                  onClick={() => {
                    setIsBetting(true)
                  }}
                />
              )}
              {wasResolvedTo && (
                <Col className="items-end">
                  <div
                    className={clsx(
                      'text-xl',
                      resolution === 'MKT' ? 'text-blue-700' : 'text-green-700'
                    )}
                  >
                    Chosen{' '}
                    {resolutions
                      ? `${Math.round(resolutions[answer.id])}%`
                      : ''}
                  </div>
                  <div className="text-2xl text-gray-500">{probPercent}</div>
                </Col>
              )}
            </>
          )}
        </Row>
      )}
    </Col>
  )
}

function AnswerBetPanel(props: {
  answer: Answer
  contract: Contract
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
    ? calculatePayoutAfterCorrectBet(contract, {
        outcome: answerId,
        amount: betAmount,
        shares,
      } as Bet)
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

function CreateAnswerInput(props: { contract: Contract }) {
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

function AnswerResolvePanel(props: {
  contract: Contract
  resolveOption: 'CHOOSE' | 'CHOOSE_MULTIPLE' | 'CANCEL' | undefined
  setResolveOption: (
    option: 'CHOOSE' | 'CHOOSE_MULTIPLE' | 'CANCEL' | undefined
  ) => void
  chosenAnswers: { [answerId: string]: number }
}) {
  const { contract, resolveOption, setResolveOption, chosenAnswers } = props
  const answers = Object.keys(chosenAnswers)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const onResolve = async () => {
    if (resolveOption === 'CHOOSE' && answers.length !== 1) return
    if (resolveOption === 'CHOOSE_MULTIPLE' && answers.length < 2) return

    setIsSubmitting(true)

    const totalProb = _.sum(Object.values(chosenAnswers))
    const normalizedProbs = _.mapValues(
      chosenAnswers,
      (prob) => (100 * prob) / totalProb
    )

    const resolutionProps = removeUndefinedProps({
      outcome:
        resolveOption === 'CHOOSE'
          ? answers[0]
          : resolveOption === 'CHOOSE_MULTIPLE'
          ? 'MKT'
          : 'CANCEL',
      resolutions:
        resolveOption === 'CHOOSE_MULTIPLE' ? normalizedProbs : undefined,
      contractId: contract.id,
    })

    const result = await resolveMarket(resolutionProps).then((r) => r.data)

    console.log('resolved', resolutionProps, 'result:', result)

    if (result?.status !== 'success') {
      setError(result?.message || 'Error resolving market')
    }
    setResolveOption(undefined)
    setIsSubmitting(false)
  }

  const resolutionButtonClass =
    resolveOption === 'CANCEL'
      ? 'bg-yellow-400 hover:bg-yellow-500'
      : resolveOption === 'CHOOSE' && answers.length
      ? 'btn-primary'
      : resolveOption === 'CHOOSE_MULTIPLE' &&
        answers.length > 1 &&
        answers.every((answer) => chosenAnswers[answer] > 0)
      ? 'bg-blue-400 hover:bg-blue-500'
      : 'btn-disabled'

  return (
    <Col className="gap-4 p-4 bg-gray-50 rounded">
      <div>Resolve your market</div>
      <Col className="sm:flex-row sm:items-center gap-4">
        <ChooseCancelSelector
          className="sm:!flex-row sm:items-center"
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
