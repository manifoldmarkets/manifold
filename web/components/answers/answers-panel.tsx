import { sortBy, partition, sum } from 'lodash'
import { useEffect, useState } from 'react'

import { FreeResponseContract, MultipleChoiceContract } from 'common/contract'
import { Col } from '../layout/col'
import { useUser } from 'web/hooks/use-user'
import { getDpmOutcomeProbability } from 'common/calculate-dpm'
import { useAnswers } from 'web/hooks/use-answers'
import { tradingAllowed } from 'web/lib/firebase/contracts'
import { AnswerItem } from './answer-item'
import { CreateAnswerPanel } from './create-answer-panel'
import { AnswerResolvePanel } from './answer-resolve-panel'
import { Spacer } from '../layout/spacer'
import { getOutcomeProbability } from 'common/calculate'
import { Answer } from 'common/answer'
import clsx from 'clsx'
import { formatPercent } from 'common/util/format'
import { Modal } from 'web/components/layout/modal'
import { AnswerBetPanel } from 'web/components/answers/answer-bet-panel'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/avatar'
import { Linkify } from 'web/components/linkify'
import { Button } from 'web/components/button'
import { useAdmin } from 'web/hooks/use-admin'
import { needsAdminToResolve } from 'web/pages/[username]/[contractSlug]'
import { CHOICE_ANSWER_COLORS } from '../charts/contract/choice'
import { useChartAnswers } from '../charts/contract/choice'
import { ChatIcon } from '@heroicons/react/outline'

export function AnswersPanel(props: {
  contract: FreeResponseContract | MultipleChoiceContract
  onAnswerCommentClick: (answer: Answer) => void
}) {
  const isAdmin = useAdmin()
  const { contract, onAnswerCommentClick } = props
  const { creatorId, resolution, resolutions, totalBets, outcomeType } =
    contract
  const [showAllAnswers, setShowAllAnswers] = useState(false)

  const answers = (useAnswers(contract.id) ?? contract.answers).filter(
    (a) => a.number != 0 || contract.outcomeType === 'MULTIPLE_CHOICE'
  )

  const hasZeroBetAnswers = answers.some((answer) => totalBets[answer.id] < 1)

  const [winningAnswers, losingAnswers] = partition(
    answers.filter((a) => (showAllAnswers ? true : totalBets[a.id] > 0)),
    (answer) =>
      answer.id === resolution || (resolutions && resolutions[answer.id])
  )
  const sortedAnswers = [
    ...sortBy(winningAnswers, (answer) =>
      resolutions ? -1 * resolutions[answer.id] : 0
    ),
    ...sortBy(
      resolution ? [] : losingAnswers,
      (answer) => -1 * getDpmOutcomeProbability(contract.totalShares, answer.id)
    ),
  ]

  const answerItems = sortBy(
    losingAnswers.length > 0 ? losingAnswers : sortedAnswers,
    (answer) => -getOutcomeProbability(contract, answer.id)
  )

  const user = useUser()

  const [resolveOption, setResolveOption] = useState<
    'CHOOSE' | 'CHOOSE_MULTIPLE' | 'CANCEL' | undefined
  >()
  const [chosenAnswers, setChosenAnswers] = useState<{
    [answerId: string]: number
  }>({})

  const chosenTotal = sum(Object.values(chosenAnswers))

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

  useEffect(() => {
    setChosenAnswers({})
  }, [resolveOption])

  const showChoice = resolution
    ? undefined
    : resolveOption === 'CHOOSE'
    ? 'radio'
    : resolveOption === 'CHOOSE_MULTIPLE'
    ? 'checkbox'
    : undefined

  const colorSortedAnswer = useChartAnswers(contract).map(
    (value, _index) => value.text
  )

  return (
    <Col className="gap-3">
      {(resolveOption || resolution) &&
        sortedAnswers.map((answer) => (
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

      {!resolveOption && (
        <Col
          className={clsx(
            'gap-2 pr-2 md:pr-0',
            tradingAllowed(contract) ? '' : '-mb-6'
          )}
        >
          {answerItems.map((item) => (
            <OpenAnswer
              key={item.id}
              answer={item}
              contract={contract}
              colorIndex={colorSortedAnswer.indexOf(item.text)}
              onAnswerCommentClick={onAnswerCommentClick}
            />
          ))}
          {hasZeroBetAnswers && !showAllAnswers && (
            <Button
              className="self-end"
              color="gray-white"
              onClick={() => setShowAllAnswers(true)}
              size="md"
            >
              Show More
            </Button>
          )}
        </Col>
      )}

      {answers.length <= 1 && (
        <div className="pb-4 text-gray-500">No answers yet...</div>
      )}

      {outcomeType === 'FREE_RESPONSE' && tradingAllowed(contract) && (
        <CreateAnswerPanel contract={contract} />
      )}

      {(user?.id === creatorId || (isAdmin && needsAdminToResolve(contract))) &&
        !resolution && (
          <>
            <Spacer h={2} />
            <AnswerResolvePanel
              isAdmin={isAdmin}
              isCreator={user?.id === creatorId}
              contract={contract}
              resolveOption={resolveOption}
              setResolveOption={setResolveOption}
              chosenAnswers={chosenAnswers}
            />
          </>
        )}
    </Col>
  )
}

function OpenAnswer(props: {
  contract: FreeResponseContract | MultipleChoiceContract
  answer: Answer
  colorIndex: number | undefined
  onAnswerCommentClick: (answer: Answer) => void
}) {
  const { answer, contract, colorIndex, onAnswerCommentClick } = props
  const { username, avatarUrl, text } = answer
  const prob = getDpmOutcomeProbability(contract.totalShares, answer.id)
  const probPercent = formatPercent(prob)
  const [open, setOpen] = useState(false)
  const color =
    colorIndex != undefined && colorIndex < CHOICE_ANSWER_COLORS.length
      ? CHOICE_ANSWER_COLORS[colorIndex] + '55' // semi-transparent
      : '#B1B1C755'
  const colorWidth = 100 * Math.max(prob, 0.01)

  return (
    <Col className="my-1 px-2">
      <Modal open={open} setOpen={setOpen} position="center">
        <AnswerBetPanel
          answer={answer}
          contract={contract}
          closePanel={() => setOpen(false)}
          className="sm:max-w-84 !rounded-md bg-white !px-8 !py-6"
          isModal={true}
        />
      </Modal>

      <Col
        className={clsx(
          'relative w-full rounded-lg transition-all',
          tradingAllowed(contract) ? 'text-greyscale-7' : 'text-greyscale-5'
        )}
        style={{
          background: `linear-gradient(to right, ${color} ${colorWidth}%, #FBFBFF ${colorWidth}%)`,
        }}
      >
        <Row className="z-20 -mb-1 justify-between gap-2 py-2 px-3">
          <Row>
            <Avatar
              className="mt-0.5 mr-2 inline h-5 w-5 border border-transparent transition-transform hover:border-none"
              username={username}
              avatarUrl={avatarUrl}
            />
            <Linkify
              className="text-md cursor-pointer whitespace-pre-line"
              text={text}
            />
          </Row>
          <Row className="gap-2">
            <div className="my-auto text-xl">{probPercent}</div>
            {tradingAllowed(contract) && (
              <Button
                size="2xs"
                color="gray-outline"
                onClick={() => setOpen(true)}
                className="my-auto"
              >
                BUY
              </Button>
            )}
            {
              <button
                className="p-1"
                onClick={() => onAnswerCommentClick(answer)}
              >
                <ChatIcon className="text-greyscale-4 hover:text-greyscale-6 h-5 w-5 transition-colors" />
              </button>
            }
          </Row>
        </Row>
      </Col>
    </Col>
  )
}
