import { ChatIcon } from '@heroicons/react/outline'
import { groupBy, partition, sortBy, sum } from 'lodash'
import { useEffect, useState } from 'react'

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
import { formatMoney, formatPercent } from 'common/util/format'
import { AnswerBetPanel } from 'web/components/answers/answer-bet-panel'
import { Button } from 'web/components/buttons/button'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { Avatar, EmptyAvatar } from 'web/components/widgets/avatar'
import { Linkify } from 'web/components/widgets/linkify'
import { useAdmin } from 'web/hooks/use-admin'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { useUserByIdOrAnswer } from 'web/hooks/use-user-supabase'
import { BuyPanel } from '../bet/bet-panel'
import { nthColor, useChartAnswers } from '../charts/contract/choice'
import { Col } from '../layout/col'
import { NoLabel, YesLabel } from '../outcome-label'
import { GradientContainer } from '../widgets/gradient-container'
import { Subtitle } from '../widgets/subtitle'
import { AnswerItem } from './answer-item'
import { AnswerResolvePanel } from './answer-resolve-panel'
import { CreateAnswerPanel } from './create-answer-panel'
import Link from 'next/link'

export function getAnswerColor(
  answer: Answer | DpmAnswer,
  answersArray: string[]
) {
  const index =
    'index' in answer ? answer.index : answersArray.indexOf(answer.text)
  return nthColor(index)
}

const NUM_TRUNCATED_ANSWERS = 4

export function AnswersPanel(props: {
  contract: MultiContract
  onAnswerCommentClick: (answer: Answer | DpmAnswer) => void
  showResolver?: boolean
  isInModal?: boolean
  truncateAnswers?: boolean
}) {
  const isAdmin = useAdmin()
  const {
    contract,
    onAnswerCommentClick,
    showResolver,
    isInModal,
    truncateAnswers,
  } = props
  const { creatorId, resolution, resolutions, outcomeType } = contract
  const [showAllAnswers, setShowAllAnswers] = useState(false)

  const isMultipleChoice = outcomeType === 'MULTIPLE_CHOICE'

  const answers = contract.answers.filter(
    (a) => isMultipleChoice || ('number' in a && a.number !== 0)
  )

  const answerProbs = answers.map((answer) =>
    getAnswerProbability(contract, answer.id)
  )
  const answerToProb = Object.fromEntries(
    answers.map((answer, i) => [answer.id, answerProbs[i]])
  )

  const answersToHide =
    isMultipleChoice || answers.length <= 5
      ? []
      : answers.filter((answer) => answerToProb[answer.id] < 0.01)

  const sortedAnswers = sortBy(answers, (answer) =>
    !truncateAnswers && 'index' in answer
      ? answer.index
      : -1 * answerToProb[answer.id]
  )

  const [winningAnswers, losingAnswers] = partition(
    sortedAnswers.filter((answer) =>
      showAllAnswers ? true : !answersToHide.find((a) => answer.id === a.id)
    ),
    (answer) =>
      answer.id === resolution || (resolutions && resolutions[answer.id])
  )
  const answerItems = [
    ...sortBy(winningAnswers, (answer) =>
      resolutions ? -1 * resolutions[answer.id] : 0
    ),
    ...(resolution ? [] : losingAnswers),
  ].slice(0, truncateAnswers ? NUM_TRUNCATED_ANSWERS : undefined)

  const openAnswers = (
    losingAnswers.length > 0 ? losingAnswers : answerItems
  ).slice(0, truncateAnswers ? NUM_TRUNCATED_ANSWERS : undefined)

  const user = useUser()
  const privateUser = usePrivateUser()

  const [resolveOption, setResolveOption] = useState<
    'CHOOSE_ONE' | 'CHOOSE_MULTIPLE' | 'CANCEL' | undefined
  >()
  const [chosenAnswers, setChosenAnswers] = useState<{
    [answerId: string]: number
  }>({})

  const chosenTotal = sum(Object.values(chosenAnswers))

  const onChoose = (answerId: string, prob: number) => {
    if (resolveOption === 'CHOOSE_ONE') {
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

  useEffect(() => {
    setChosenAnswers({})
  }, [resolveOption])

  const showChoice = resolution
    ? undefined
    : resolveOption === 'CHOOSE_ONE'
    ? 'radio'
    : resolveOption === 'CHOOSE_MULTIPLE'
    ? 'checkbox'
    : undefined

  const answersArray = useChartAnswers(contract).map(
    (answer, _index) => answer.text
  )

  const userBets = useUserContractBets(user?.id, contract.id)
  const userBetsByAnswer = groupBy(userBets, (bet) => bet.answerId)

  const answerItemComponents = answerItems.map((answer) => (
    <AnswerItem
      key={answer.id}
      answer={answer}
      contract={contract}
      showChoice={showChoice}
      chosenProb={chosenAnswers[answer.id]}
      totalChosenProb={chosenTotal}
      onChoose={onChoose}
      onDeselect={onDeselect}
      isInModal={isInModal}
    />
  ))

  // if this is in a modal
  if (isInModal) {
    return (
      <Col className="w-full">
        <AnswerResolvePanel
          isAdmin={isAdmin}
          isCreator={user?.id === creatorId}
          contract={contract}
          resolveOption={resolveOption}
          setResolveOption={setResolveOption}
          chosenAnswers={chosenAnswers}
          isInModal={isInModal}
        />
        {!!resolveOption && (
          <Col className="mt-4 w-full gap-3">{answerItemComponents}</Col>
        )}
      </Col>
    )
  } else {
    return (
      <Col className="gap-3">
        {showResolver && (
          <GradientContainer className="mb-4">
            <AnswerResolvePanel
              isAdmin={isAdmin}
              isCreator={user?.id === creatorId}
              contract={contract}
              resolveOption={resolveOption}
              setResolveOption={setResolveOption}
              chosenAnswers={chosenAnswers}
            />

            {!!resolveOption && (
              <Col className="mt-4 gap-3">{answerItemComponents}</Col>
            )}
          </GradientContainer>
        )}

        {resolution && answerItemComponents}

        {!resolveOption && (
          <Col className="gap-2">
            {openAnswers.map((answer) => (
              <OpenAnswer
                key={answer.id}
                answer={answer}
                contract={contract}
                onAnswerCommentClick={onAnswerCommentClick}
                color={getAnswerColor(answer, answersArray)}
                userBets={userBetsByAnswer[answer.id]}
              />
            ))}
            {answersToHide.length > 0 && !showAllAnswers && (
              <Button
                className="self-end"
                color="gray-white"
                onClick={() => setShowAllAnswers(true)}
                size="md"
              >
                Show more
              </Button>
            )}
          </Col>
        )}

        {truncateAnswers && answers.length > openAnswers.length && (
          <Link
            className="text-ink-500 hover:text-primary-500"
            href={contractPath(contract)}
          >
            See all options
          </Link>
        )}

        {answers.length === 0 && (
          <div className="text-ink-500 pb-4">No answers yet...</div>
        )}

        {outcomeType === 'FREE_RESPONSE' &&
          user &&
          tradingAllowed(contract) &&
          !resolveOption &&
          !privateUser?.blockedByUserIds.includes(contract.creatorId) && (
            <CreateAnswerPanel contract={contract} />
          )}
      </Col>
    )
  }
}

function OpenAnswer(props: {
  contract: MultiContract
  answer: Answer | DpmAnswer
  color: string
  onAnswerCommentClick: (answer: Answer | DpmAnswer) => void
  userBets?: Bet[]
}) {
  const { answer, contract, onAnswerCommentClick, color, userBets } = props
  const { text } = answer
  const answerCreator = useUserByIdOrAnswer(answer)
  const prob = getAnswerProbability(contract, answer.id)
  const probPercent = formatPercent(prob)
  const [outcome, setOutcome] = useState<'YES' | 'NO' | 'LIMIT' | undefined>(
    undefined
  )
  const colorWidth = 100 * prob
  const isCpmm = contract.mechanism === 'cpmm-multi-1'
  const isDpm = contract.mechanism === 'dpm-2'
  const isFreeResponse = contract.outcomeType === 'FREE_RESPONSE'

  const user = useUser()
  const hasBets =
    userBets &&
    userBets.filter((b) => !b.isRedemption && b.amount != 0).length > 0

  return (
    <Col className="relative">
      <Modal
        open={!!outcome}
        setOpen={(open) => setOutcome(open ? 'YES' : undefined)}
        className={clsx(MODAL_CLASS, 'pointer-events-auto')}
      >
        {outcome &&
          (isCpmm ? (
            <Col className="gap-2">
              <Row className="justify-between">
                <Subtitle className="!mt-0">{answer.text}</Subtitle>
                <div className="text-xl">
                  {formatPercent((answer as Answer).prob)}
                </div>
              </Row>
              <BuyPanel
                contract={contract}
                multiProps={{
                  answers: contract.answers,
                  answerToBuy: answer as Answer,
                }}
                user={user}
                initialOutcome={outcome}
                hidden={false}
                singularView={outcome}
                onBuySuccess={() =>
                  setTimeout(() => setOutcome(undefined), 500)
                }
                location={'contract page answer'}
              />
            </Col>
          ) : (
            <AnswerBetPanel
              answer={answer}
              contract={contract}
              closePanel={() => setOutcome(undefined)}
              isModal={true}
            />
          ))}
      </Modal>

      <div
        className={clsx(
          'relative mb-3 w-full sm:mb-0',
          tradingAllowed(contract) ? 'text-ink-900' : 'text-ink-700'
        )}
      >
        {/* probability bar */}
        <div className="bg-canvas-50 absolute left-0 right-0 bottom-0 -z-10 h-3 rounded transition-all sm:top-1/2 sm:h-10 sm:-translate-y-1/2 sm:bg-inherit">
          <div
            className="h-full rounded"
            style={{
              width: `max(8px, ${colorWidth}%)`,
              background: color,
              opacity: 0.69,
            }}
          />
        </div>

        {/*  */}
        <div className="flex-wrap items-center justify-between gap-x-4 text-sm !leading-none sm:flex sm:min-h-[40px] sm:flex-nowrap sm:pl-3 sm:text-base">
          <div className="my-1 inline items-center sm:flex">
            {isFreeResponse &&
              (answerCreator ? (
                <Avatar
                  className="mr-2 inline h-5 w-5 border border-transparent transition-transform hover:border-none"
                  size="sm"
                  username={answerCreator.username}
                  avatarUrl={answerCreator.avatarUrl}
                />
              ) : (
                <EmptyAvatar />
              ))}
            <Linkify text={text} />
          </div>
          <div className="relative float-right flex grow items-center justify-end gap-2">
            <span className="text-xl">{probPercent}</span>
            {tradingAllowed(contract) &&
              (isDpm ? (
                <Button size="2xs" onClick={() => setOutcome('YES')}>
                  Bet
                </Button>
              ) : (
                <>
                  <Button
                    size="2xs"
                    color="green"
                    onClick={() => setOutcome('YES')}
                  >
                    YES
                  </Button>
                  <Button
                    size="2xs"
                    color="red"
                    onClick={() => setOutcome('NO')}
                  >
                    NO
                  </Button>
                  <Button size="2xs" color='indigo-outline' onClick={() => setOutcome('LIMIT')}>
                    %
                  </Button>
                </>
              ))}
            {isFreeResponse && (
              <button
                className="p-1"
                onClick={() => onAnswerCommentClick(answer)}
              >
                <ChatIcon className="text-ink-500 hover:text-ink-600 h-5 w-5 transition-colors" />
              </button>
            )}
            {hasBets && contract.mechanism === 'cpmm-multi-1' && (
              <AnswerPosition
                className="absolute -bottom-3.5 right-0"
                contract={contract}
                userBets={userBets}
              />
            )}
          </div>
        </div>
      </div>
    </Col>
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
