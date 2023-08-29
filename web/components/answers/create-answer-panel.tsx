import clsx from 'clsx'
import { useState } from 'react'
import { findBestMatch } from 'string-similarity'

import {
  CPMMMultiContract,
  Contract,
  FreeResponseContract,
  tradingAllowed,
} from 'common/contract'
import { BuyAmountInput } from '../widgets/amount-input'
import { Col } from '../layout/col'
import { APIError, createAnswer, createAnswerCpmm } from 'web/lib/firebase/api'
import { Row } from '../layout/row'
import {
  formatMoney,
  formatPercent,
  formatWithCommas,
} from 'common/util/format'
import { InfoTooltip } from '../widgets/info-tooltip'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import {
  calculateDpmShares,
  calculateDpmPayoutAfterCorrectBet,
  getDpmOutcomeProbabilityAfterBet,
} from 'common/calculate-dpm'
import { firebaseLogin } from 'web/lib/firebase/users'
import { Bet } from 'common/bet'
import { MAX_ANSWER_LENGTH } from 'common/answer'
import { withTracking } from 'web/lib/service/analytics'
import { lowerCase } from 'lodash'
import { Button } from '../buttons/button'
import { ExpandingInput } from '../widgets/expanding-input'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { ANSWER_COST } from 'common/economy'

export function CreateAnswerCpmmPanel(props: {
  contract: CPMMMultiContract
  onFinish?: () => void
}) {
  const { contract, onFinish } = props
  const user = useUser()
  const [text, setText] = usePersistentInMemoryState(
    '',
    'create-answer-text' + contract.id
  )
  const [answerError, setAnswerError] = useState<string | undefined>()
  const [possibleDuplicateAnswer, setPossibleDuplicateAnswer] = useState<
    string | undefined
  >()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { answers } = contract

  const canSubmit = text && !isSubmitting && !answerError

  const submitAnswer = async () => {
    if (canSubmit) {
      setIsSubmitting(true)

      try {
        await createAnswerCpmm({
          contractId: contract.id,
          text,
        })
        setText('')
        setPossibleDuplicateAnswer(undefined)
      } catch (e) {}

      setIsSubmitting(false)
      if (onFinish) onFinish()
    }
  }

  const changeAnswer = (text: string) => {
    setText(text)
    const existingAnswer = answers.find(
      (a) => lowerCase(a.text) === lowerCase(text)
    )

    if (existingAnswer) {
      setAnswerError(
        existingAnswer
          ? `"${existingAnswer.text}" already exists as an answer. Can't see it? Hit the 'Show More' button right above this box.`
          : ''
      )
      return
    } else {
      setAnswerError('')
    }

    if (answers.length && text) {
      const matches = findBestMatch(
        lowerCase(text),
        answers.map((a) => lowerCase(a.text))
      )
      setPossibleDuplicateAnswer(
        matches.bestMatch.rating > 0.8
          ? answers[matches.bestMatchIndex].text
          : ''
      )
    }
  }

  if (user?.isBannedFromPosting) return <></>

  return (
    <Col className="bg-canvas-50 gap-2 rounded-lg p-2">
      <ExpandingInput
        value={text}
        onChange={(e) => changeAnswer(e.target.value)}
        className="w-full"
        placeholder="Add another answer"
        rows={1}
        maxLength={MAX_ANSWER_LENGTH}
        autoFocus={!!onFinish}
      />
      {answerError ? (
        <AnswerError key={1} level="error" text={answerError} />
      ) : possibleDuplicateAnswer ? (
        <AnswerError
          key={2}
          level="warning"
          text={`Did you mean to bet on "${possibleDuplicateAnswer}"?`}
        />
      ) : undefined}
      <Row className={'justify-end gap-2'}>
        {onFinish && (
          <Button color="gray" onClick={onFinish}>
            Cancel
          </Button>
        )}
        <Button
          loading={isSubmitting}
          disabled={!canSubmit}
          onClick={withTracking(submitAnswer, 'submit answer')}
        >
          Add answer ({formatMoney(ANSWER_COST)})
        </Button>
      </Row>
    </Col>
  )
}

function CreateAnswerDpmPanel(props: { contract: FreeResponseContract }) {
  const { contract } = props
  const user = useUser()
  const [text, setText] = useState('')
  const [betAmount, setBetAmount] = useState<number | undefined>(10)
  const [amountError, setAmountError] = useState<string | undefined>()
  const [answerError, setAnswerError] = useState<string | undefined>()
  const [possibleDuplicateAnswer, setPossibleDuplicateAnswer] = useState<
    string | undefined
  >()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { answers } = contract

  const canSubmit =
    text && betAmount && !amountError && !isSubmitting && !answerError

  const submitAnswer = async () => {
    if (canSubmit) {
      setIsSubmitting(true)

      try {
        await createAnswer({
          contractId: contract.id,
          text,
          amount: betAmount,
        })
        setText('')
        setBetAmount(10)
        setAmountError(undefined)
        setPossibleDuplicateAnswer(undefined)
      } catch (e) {
        if (e instanceof APIError) {
          setAmountError(e.toString())
        }
      }

      setIsSubmitting(false)
    }
  }

  const changeAnswer = (text: string) => {
    setText(text)
    const existingAnswer = answers.find(
      (a) => lowerCase(a.text) === lowerCase(text)
    )

    if (existingAnswer) {
      setAnswerError(
        existingAnswer
          ? `"${existingAnswer.text}" already exists as an answer. Can't see it? Hit the 'Show More' button right above this box.`
          : ''
      )
      return
    } else {
      setAnswerError('')
    }

    if (answers.length && text) {
      const matches = findBestMatch(
        lowerCase(text),
        answers.map((a) => lowerCase(a.text))
      )
      setPossibleDuplicateAnswer(
        matches.bestMatch.rating > 0.8
          ? answers[matches.bestMatchIndex].text
          : ''
      )
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

  if (user?.isBannedFromPosting) return <></>

  return (
    <Col className="gap-4 rounded">
      <Col className="flex-1 gap-2 px-4 xl:px-0">
        <div className="mb-1">Add your answer</div>
        <ExpandingInput
          value={text}
          onChange={(e) => changeAnswer(e.target.value)}
          className="w-full"
          placeholder="Type your answer..."
          rows={1}
          maxLength={MAX_ANSWER_LENGTH}
        />
        {answerError ? (
          <AnswerError key={1} level="error" text={answerError} />
        ) : possibleDuplicateAnswer ? (
          <AnswerError
            key={2}
            level="warning"
            text={`Did you mean to bet on "${possibleDuplicateAnswer}"?`}
          />
        ) : undefined}
        <div />
        <Col className={'justify-between sm:flex-row'}>
          <Row
            className={clsx('w-full flex-wrap gap-4 sm:max-w-md sm:flex-col')}
          >
            {text && (
              <>
                <Col className="mt-1 w-full gap-2">
                  <Row className="text-ink-500 my-3 justify-between text-left text-sm">
                    Bet Amount
                    <span className={'sm:hidden'}>
                      Balance: {formatMoney(user?.balance ?? 0)}
                    </span>
                  </Row>{' '}
                  <BuyAmountInput
                    inputClassName={'w-32'}
                    amount={betAmount}
                    onChange={setBetAmount}
                    error={amountError}
                    setError={setAmountError}
                    minimumAmount={1}
                    disabled={isSubmitting}
                    sliderOptions={{ show: true, wrap: false }}
                  />
                </Col>
                <Col className="w-full gap-3 sm:max-w-md">
                  <Row className="items-center justify-between text-sm">
                    <div className="text-ink-500">Probability</div>
                    <Row>
                      <div>{formatPercent(0)}</div>
                      <div className="mx-2">→</div>
                      <div>{formatPercent(resultProb)}</div>
                    </Row>
                  </Row>

                  <Row className="items-center justify-between gap-4 text-sm">
                    <Row className="text-ink-500 flex-nowrap items-center gap-2 whitespace-nowrap">
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
          </Row>
          <Row
            className={
              'mt-3 justify-end pl-2 sm:mt-0 sm:min-w-[10rem] sm:flex-col'
            }
          >
            {user ? (
              <Button
                color="green"
                size="lg"
                loading={isSubmitting}
                disabled={!canSubmit}
                onClick={withTracking(submitAnswer, 'submit answer')}
              >
                Submit
              </Button>
            ) : (
              text && (
                <Button
                  color="green"
                  size="lg"
                  className="self-end whitespace-nowrap "
                  onClick={withTracking(firebaseLogin, 'answer panel sign in')}
                >
                  Add my answer
                </Button>
              )
            )}
          </Row>
        </Col>
      </Col>
    </Col>
  )
}

export function CreateAnswerPanel(props: { contract: Contract }) {
  const { contract } = props
  const addAnswersMode =
    'addAnswersMode' in contract
      ? contract.addAnswersMode
      : contract.outcomeType === 'FREE_RESPONSE'
      ? 'ANYONE'
      : 'DISABLED'

  const user = useUser()
  const privateUser = usePrivateUser()

  if (
    addAnswersMode !== 'ANYONE' ||
    !user ||
    !tradingAllowed(contract) ||
    privateUser?.blockedByUserIds.includes(contract.creatorId)
  ) {
    return null
  }

  if (
    contract.outcomeType === 'MULTIPLE_CHOICE' &&
    contract.mechanism === 'cpmm-multi-1'
  ) {
    return <CreateAnswerCpmmPanel contract={contract} />
  } else {
    return <CreateAnswerDpmPanel contract={contract as FreeResponseContract} />
  }
}

type answerErrorLevel = 'warning' | 'error'

const AnswerError = (props: { text: string; level: answerErrorLevel }) => {
  const { text, level } = props
  const colorClass =
    {
      error: 'text-scarlet-500',
      warning: 'text-orange-600',
    }[level] ?? ''
  return (
    <div
      className={`${colorClass} mb-2 mr-auto self-center text-xs font-medium tracking-wide`}
    >
      {text}
    </div>
  )
}
