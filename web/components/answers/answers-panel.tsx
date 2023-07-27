import { ArrowRightIcon, ChevronDoubleDownIcon } from '@heroicons/react/outline'
import { groupBy, sortBy } from 'lodash'
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
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { useUserByIdOrAnswer } from 'web/hooks/use-user-supabase'
import { nthColor, useChartAnswers } from '../charts/contract/choice'
import { Col } from '../layout/col'
import { NoLabel, YesLabel } from '../outcome-label'
import { AnswerBar, AnswerLabel } from './answer-item'
import { CreateAnswerPanel } from './create-answer-panel'
import {
  AddComment,
  ClosedProb,
  DPMMultiBettor,
  MultiBettor,
  OpenProb,
} from './answer-options'

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

  const [showSmallAnswers, setShowSmallAnswers] = useState(isMultipleChoice)

  const answers = contract.answers
    .filter((a) => isMultipleChoice || ('number' in a && a.number !== 0))
    .map((a) => ({ ...a, prob: getAnswerProbability(contract, a.id) }))

  const sortedAnswers = sortBy(answers, [
    // winners before losers
    (answer) => (resolutions ? -1 * resolutions[answer.id] : 0),
    // then by prob or index
    (answer) =>
      answers.length <= maxAnswers && 'index' in answer
        ? answer.index
        : -1 * answer.prob,
  ])

  const answersToShow = (
    showSmallAnswers || answers.length <= 5
      ? sortedAnswers
      : sortedAnswers.filter(
          (answer) => answer.prob >= 0.01 || resolutions?.[answer.id]
        )
  ).slice(0, maxAnswers)

  const user = useUser()
  const privateUser = usePrivateUser()

  const answersArray = useChartAnswers(contract).map(
    (answer, _index) => answer.text
  )

  const userBets = useUserContractBets(user?.id, contract.id)
  const userBetsByAnswer = groupBy(userBets, (bet) => bet.answerId)

  const moreCount = answers.length - answersToShow.length

  return (
    <Col className="gap-3">
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
            <Link
              className="text-ink-500 hover:text-primary-500"
              href={contractPath(contract)}
            >
              See {moreCount} more {moreCount === 1 ? 'answer' : 'answers'}{' '}
              <ArrowRightIcon className="inline h-4 w-4" />
            </Link>
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

      {answers.length === 0 && (
        <div className="text-ink-500 pb-4">No answers yet...</div>
      )}

      {outcomeType === 'FREE_RESPONSE' &&
        user &&
        tradingAllowed(contract) &&
        !privateUser?.blockedByUserIds.includes(contract.creatorId) && (
          <CreateAnswerPanel contract={contract} />
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

  const { resolution, resolutions } = contract
  const resolvedProb =
    resolution == undefined
      ? undefined
      : resolution === answer.id
      ? 1
      : (resolutions?.[answer.id] ?? 0) / 100

  const hasBets =
    userBets &&
    userBets.filter((b) => !b.isRedemption && b.amount != 0).length > 0

  return (
    <AnswerBar
      color={color}
      prob={prob}
      resolvedProb={resolvedProb}
      label={
        <AnswerLabel
          text={answer.text}
          creator={isFreeResponse ? answerCreator ?? false : undefined}
          className={clsx(
            'items-center text-sm !leading-none sm:flex sm:text-base',
            resolvedProb === 0 ? 'text-ink-600' : 'text-ink-900'
          )}
        />
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
                <MultiBettor
                  answer={answer as any}
                  contract={contract as any}
                />
              )}
            </>
          )}
          {onAnswerCommentClick && isFreeResponse && (
            <AddComment onClick={() => onAnswerCommentClick(answer)} />
          )}
        </>
      }
      bottom={
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
