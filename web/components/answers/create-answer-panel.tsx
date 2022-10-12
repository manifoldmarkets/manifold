import clsx from 'clsx'
import React, { useState } from 'react'
import { findBestMatch } from 'string-similarity'

import { FreeResponseContract } from 'common/contract'
import { BuyAmountInput } from '../amount-input'
import { Col } from '../layout/col'
import { APIError, createAnswer } from 'web/lib/firebase/api'
import { Row } from '../layout/row'
import {
  formatMoney,
  formatPercent,
  formatWithCommas,
} from 'common/util/format'
import { InfoTooltip } from '../info-tooltip'
import { useUser } from 'web/hooks/use-user'
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
import { Button } from '../button'
import { ExpandingInput } from '../expanding-input'

export function CreateAnswerPanel(props: { contract: FreeResponseContract }) {
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
        <Col
          className={clsx(
            'gap-4 sm:flex-row sm:items-end',
            text ? 'justify-between' : 'self-end'
          )}
        >
          {text && (
            <>
              <Col className="mt-1 gap-2">
                <Row className="my-3 justify-between text-left text-sm text-gray-500">
                  Bet Amount
                  <span className={'sm:hidden'}>
                    Balance: {formatMoney(user?.balance ?? 0)}
                  </span>
                </Row>{' '}
                <BuyAmountInput
                  amount={betAmount}
                  onChange={setBetAmount}
                  error={amountError}
                  setError={setAmountError}
                  minimumAmount={1}
                  disabled={isSubmitting}
                  showSliderOnMobile
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
        </Col>
      </Col>
    </Col>
  )
}

type answerErrorLevel = 'warning' | 'error'

const AnswerError = (props: { text: string; level: answerErrorLevel }) => {
  const { text, level } = props
  const colorClass =
    {
      error: 'text-red-500',
      warning: 'text-orange-500',
    }[level] ?? ''
  return (
    <div
      className={`${colorClass} mb-2 mr-auto self-center text-xs font-medium tracking-wide`}
    >
      {text}
    </div>
  )
}
