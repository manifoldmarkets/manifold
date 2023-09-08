import { ArrowRightIcon, ChevronDoubleDownIcon } from '@heroicons/react/outline'
import { groupBy, sortBy, sumBy } from 'lodash'
import { useState } from 'react'

import clsx from 'clsx'
import { Answer, DpmAnswer } from 'common/answer'
import { Bet } from 'common/bet'
import { getAnswerProbability, getContractBetMetrics } from 'common/calculate'
import {
  CPMMMultiContract,
  MultiContract,
  contractPath,
  tradingAllowed,
} from 'common/contract'
import { formatMoney } from 'common/util/format'
import Link from 'next/link'
import { Button } from 'web/components/buttons/button'
import { Row } from 'web/components/layout/row'
import { useUser } from 'web/hooks/use-user'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { useUserByIdOrAnswer } from 'web/hooks/use-user-supabase'
import { nthColor, useChartAnswers } from '../charts/contract/choice'
import { Col } from '../layout/col'
import { NoLabel, YesLabel } from '../outcome-label'
import { AnswerBar, AnswerLabel } from './answer-item'
import {
  AddComment,
  ClosedProb,
  DPMMultiBettor,
  MultiBettor,
  MultiSeller,
  OpenProb,
} from './answer-options'
import { floatingEqual } from 'common/util/math'
import { InfoTooltip } from '../widgets/info-tooltip'

export function getAnswerColor(
  answer: Answer | DpmAnswer,
  answersArray: string[]
) {
  const index =
    'index' in answer ? answer.index : answersArray.indexOf(answer.text)
  return nthColor(index)
}

export function AnswersPanel(props: {
  contract: MultiContract
  onAnswerCommentClick?: (answer: Answer | DpmAnswer) => void
  linkToContract?: boolean
  maxAnswers?: number
}) {
  const {
    contract,
    onAnswerCommentClick,
    linkToContract,
    maxAnswers = Infinity,
  } = props
  const { resolutions, outcomeType } = contract
  const isMultipleChoice = outcomeType === 'MULTIPLE_CHOICE'
  const addAnswersMode =
    'addAnswersMode' in contract
      ? contract.addAnswersMode
      : outcomeType === 'FREE_RESPONSE'
      ? 'ANYONE'
      : 'DISABLED'

  const [showSmallAnswers, setShowSmallAnswers] = useState(isMultipleChoice)

  const answers = contract.answers
    .filter((a) => isMultipleChoice || ('number' in a && a.number !== 0))
    .map((a) => ({ ...a, prob: getAnswerProbability(contract, a.id) }))

  const sortByProb = addAnswersMode === 'ANYONE' || answers.length > maxAnswers
  const sortedAnswers = sortBy(answers, [
    // winners before losers
    (answer) => (resolutions ? -1 * resolutions[answer.id] : 0),
    // then by prob or index
    (answer) =>
      !sortByProb && 'index' in answer ? answer.index : -1 * answer.prob,
  ])

  const answersToShow = (
    showSmallAnswers || answers.length <= 5
      ? sortedAnswers
      : sortedAnswers.filter(
          (answer) => answer.prob >= 0.01 || resolutions?.[answer.id]
        )
  ).slice(0, maxAnswers)

  const user = useUser()

  const answersArray = useChartAnswers(contract).map(
    (answer, _index) => answer.text
  )

  const userBets = useUserContractBets(user?.id, contract.id)
  const userBetsByAnswer = groupBy(userBets, (bet) => bet.answerId)

  const moreCount = answers.length - answersToShow.length

  return (
    <Col className="mx-[2px] gap-3">
      {/* Note: Answers can be length 1 if it is "Other".
          In that case, we'll wait until another answer is added before showing any answers.
      */}
      {answers.length !== 1 && (
        <Col className="gap-2">
          {answersToShow.map((answer) => (
            <Answer
              key={answer.id}
              answer={answer}
              contract={contract}
              onAnswerCommentClick={onAnswerCommentClick}
              color={getAnswerColor(answer, answersArray)}
              userBets={userBetsByAnswer[answer.id]}
            />
          ))}
          {moreCount > 0 &&
            (linkToContract ? (
              <Row className="w-full justify-end">
                <Link
                  className="text-ink-500 hover:text-primary-500 text-sm"
                  href={contractPath(contract)}
                >
                  See {moreCount} more {moreCount === 1 ? 'answer' : 'answers'}{' '}
                  <ArrowRightIcon className="inline h-4 w-4" />
                </Link>
              </Row>
            ) : (
              <Button
                color="gray-white"
                onClick={() => setShowSmallAnswers(true)}
                size="xs"
              >
                {moreCount} more {moreCount === 1 ? 'answer' : 'answers'}
                <ChevronDoubleDownIcon className="ml-1 h-4 w-4" />
              </Button>
            ))}
        </Col>
      )}

      {(answers.length === 0 ||
        (answers.length === 1 && outcomeType === 'MULTIPLE_CHOICE')) && (
        <div className="text-ink-500 pb-4">No answers yet...</div>
      )}
    </Col>
  )
}

function Answer(props: {
  contract: MultiContract
  answer: Answer | DpmAnswer
  color: string
  onAnswerCommentClick?: (answer: Answer | DpmAnswer) => void
  userBets?: Bet[]
}) {
  const { answer, contract, onAnswerCommentClick, color, userBets } = props

  const answerCreator = useUserByIdOrAnswer(answer)
  const prob = getAnswerProbability(contract, answer.id)

  const isCpmm = contract.mechanism === 'cpmm-multi-1'
  const isDpm = contract.mechanism === 'dpm-2'
  const isFreeResponse = contract.outcomeType === 'FREE_RESPONSE'
  const isOther = 'isOther' in answer && answer.isOther
  const addAnswersMode =
    'addAnswersMode' in contract
      ? contract.addAnswersMode ?? 'DISABLED'
      : isFreeResponse
      ? 'ANYONE'
      : 'DISABLED'

  const { resolution, resolutions } = contract
  const resolvedProb =
    resolution == undefined
      ? undefined
      : resolution === answer.id
      ? 1
      : (resolutions?.[answer.id] ?? 0) / 100

  const sharesSum = sumBy(userBets, (bet) =>
    bet.outcome === 'YES' ? bet.shares : -bet.shares
  )
  const hasBets = userBets && !floatingEqual(sharesSum, 0)
  const user = useUser()

  return (
    <AnswerBar
      color={color}
      prob={prob}
      resolvedProb={resolvedProb}
      label={
        isOther ? (
          <span>
            Other{' '}
            <InfoTooltip
              className="!text-ink-600"
              text="Represents all answers not listed. New answers are split out of this answer."
            />
          </span>
        ) : (
          <AnswerLabel
            text={answer.text}
            index={'index' in answer ? answer.index : undefined}
            createdTime={answer.createdTime}
            creator={
              addAnswersMode === 'ANYONE' ? answerCreator ?? false : undefined
            }
            className={clsx(
              'items-center text-sm !leading-none sm:flex sm:text-base',
              resolvedProb === 0 ? 'text-ink-600' : 'text-ink-900'
            )}
          />
        )
      }
      end={
        <>
          {!tradingAllowed(contract) ? (
            <ClosedProb prob={prob} resolvedProb={resolvedProb} />
          ) : (
            <>
              <OpenProb prob={prob} />
              {isDpm ? (
                <DPMMultiBettor answer={answer as any} contract={contract} />
              ) : (
                <>
                  <MultiBettor
                    answer={answer as any}
                    contract={contract as any}
                  />
                  {user && hasBets && (
                    <MultiSeller
                      answer={answer as any}
                      contract={contract as any}
                      userBets={userBets}
                      user={user}
                    />
                  )}
                </>
              )}
            </>
          )}
          {onAnswerCommentClick && isFreeResponse && (
            <AddComment onClick={() => onAnswerCommentClick(answer)} />
          )}
        </>
      }
      bottom={
        !resolution &&
        hasBets &&
        isCpmm && <AnswerPosition contract={contract} userBets={userBets} />
      }
    />
  )
}

function AnswerPosition(props: {
  contract: CPMMMultiContract
  userBets: Bet[]
  className?: string
}) {
  const { contract, userBets, className } = props

  const { invested, totalShares } = getContractBetMetrics(contract, userBets)

  const yesWinnings = totalShares.YES ?? 0
  const noWinnings = totalShares.NO ?? 0
  const position = yesWinnings - noWinnings

  return (
    <Row
      className={clsx(
        className,
        'text-ink-500 gap-1.5 whitespace-nowrap text-xs font-semibold'
      )}
    >
      <Row className="gap-1">
        Payout
        {position > 1e-7 ? (
          <>
            <span className="text-ink-700">{formatMoney(position)}</span> on
            <YesLabel />
          </>
        ) : position < -1e-7 ? (
          <>
            <span className="text-ink-700">{formatMoney(-position)}</span> on
            <NoLabel />
          </>
        ) : (
          '——'
        )}
      </Row>
      &middot;
      <Row className="gap-1">
        <div className="text-ink-500">Spent</div>
        <div className="text-ink-700">{formatMoney(invested)}</div>
      </Row>
    </Row>
  )
}
