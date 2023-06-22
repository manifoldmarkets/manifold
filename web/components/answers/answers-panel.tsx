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
import {
  CHOICE_ANSWER_COLORS,
  useChartAnswers,
} from '../charts/contract/choice'
import { Col } from '../layout/col'
import { NoLabel, YesLabel } from '../outcome-label'
import { ProfitBadge } from '../profit-badge'
import { GradientContainer } from '../widgets/gradient-container'
import { Subtitle } from '../widgets/subtitle'
import { AnswerItem } from './answer-item'
import { AnswerResolvePanel } from './answer-resolve-panel'
import { CreateAnswerPanel } from './create-answer-panel'

export function getAnswerColor(
  answer: Answer | DpmAnswer,
  answersArray: string[]
) {
  const colorIndex = answersArray.indexOf(answer.text)
  return colorIndex != undefined && colorIndex < CHOICE_ANSWER_COLORS.length
    ? CHOICE_ANSWER_COLORS[colorIndex]
    : '#B1B1C7B3'
}

export function AnswersPanel(props: {
  contract: MultiContract
  onAnswerCommentClick: (answer: Answer | DpmAnswer) => void
  showResolver?: boolean
  isInModal?: boolean
}) {
  const isAdmin = useAdmin()
  const { contract, onAnswerCommentClick, showResolver, isInModal } = props
  const { creatorId, resolution, resolutions, outcomeType } = contract
  const [showAllAnswers, setShowAllAnswers] = useState(false)

  const isMultipleChoice = outcomeType === 'MULTIPLE_CHOICE'

  const answers = (contract.answers as (DpmAnswer | Answer)[]).filter(
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
    'index' in answer ? answer.index : -1 * answerToProb[answer.id]
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
  ]

  const openAnswers = losingAnswers.length > 0 ? losingAnswers : answerItems

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
          <Col className="gap-3">
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
  const colorWidth = 100 * Math.max(prob, 0.01)
  const isCpmm = contract.mechanism === 'cpmm-multi-1'
  const isDpm = contract.mechanism === 'dpm-2'
  const isFreeResponse = contract.outcomeType === 'FREE_RESPONSE'

  const user = useUser()
  const hasBets = userBets && userBets.filter((b) => !b.isRedemption).length > 0

  return (
    <Col>
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

      <Col
        className={clsx(
          'relative w-full rounded-lg transition-all',
          tradingAllowed(contract) ? 'text-ink-900' : 'text-ink-500'
        )}
        style={{
          background: `linear-gradient(to right, ${color} ${colorWidth}%, #94a3b833 ${colorWidth}%)`,
        }}
      >
        <Row className="z-20 justify-between gap-2 py-1.5 px-3">
          <Row className="items-center">
            {isFreeResponse &&
              (answerCreator ? (
                <Avatar
                  className="mr-2 h-5 w-5 border border-transparent transition-transform hover:border-none"
                  username={answerCreator.username}
                  avatarUrl={answerCreator.avatarUrl}
                />
              ) : (
                <EmptyAvatar />
              ))}
            <Linkify className="text-md whitespace-pre-line" text={text} />
          </Row>
          <Row className="gap-2">
            <div className="my-auto text-xl">{probPercent}</div>
            {tradingAllowed(contract) &&
              (isDpm ? (
                <Button
                  size="2xs"
                  color="gray-outline"
                  onClick={() => setOutcome('YES')}
                  className="my-auto"
                >
                  Bet
                </Button>
              ) : (
                <Row className="gap-2">
                  <Button
                    size="2xs"
                    color="green"
                    onClick={() => setOutcome('YES')}
                    className="my-auto"
                  >
                    YES
                  </Button>
                  <Button
                    size="2xs"
                    color="red"
                    onClick={() => setOutcome('NO')}
                    className="my-auto"
                  >
                    NO
                  </Button>
                  <Button
                    size="2xs"
                    color="indigo-outline"
                    onClick={() => setOutcome('LIMIT')}
                    className="my-auto"
                  >
                    %
                  </Button>
                </Row>
              ))}
            {isFreeResponse && (
              <button
                className="p-1"
                onClick={() => onAnswerCommentClick(answer)}
              >
                <ChatIcon className="text-ink-500 hover:text-ink-600 h-5 w-5 transition-colors" />
              </button>
            )}
          </Row>
        </Row>
      </Col>

      {hasBets && contract.mechanism === 'cpmm-multi-1' && (
        <AnswerPosition
          className="bg- self-end"
          contract={contract}
          userBets={userBets}
        />
      )}
    </Col>
  )
}

function AnswerPosition(props: {
  contract: CPMMMultiContract
  userBets: Bet[]
  className?: string
}) {
  const { contract, userBets, className } = props

  const { invested, profit, profitPercent, totalShares } =
    getContractBetMetrics(contract, userBets)

  const yesWinnings = totalShares.YES ?? 0
  const noWinnings = totalShares.NO ?? 0
  const position = yesWinnings - noWinnings

  return (
    <Row className={clsx(className, 'flex-wrap gap-6 sm:flex-nowrap')}>
      <Col>
        <div className="text-ink-500 whitespace-nowrap text-sm">Payout</div>
        <div className="whitespace-nowrap">
          {position > 1e-7 ? (
            <>
              {formatMoney(position)} on <YesLabel />
            </>
          ) : position < -1e-7 ? (
            <>
              {formatMoney(-position)} on <NoLabel />
            </>
          ) : (
            '——'
          )}
        </div>
      </Col>
      <Col>
        <div className="text-ink-500 whitespace-nowrap text-sm">Spent</div>
        <div className="whitespace-nowrap text-right">
          {formatMoney(invested)}
        </div>
      </Col>

      <Col>
        <div className="text-ink-500 whitespace-nowrap text-sm">Profit</div>
        <div className="whitespace-nowrap text-right">
          {formatMoney(profit)}
          <ProfitBadge profitPercent={profitPercent} round={true} />
        </div>
      </Col>
    </Row>
  )
}
