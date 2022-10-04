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
import { BuyButton } from 'web/components/yes-no-selector'
import { UserLink } from 'web/components/user-link'
import { Button } from 'web/components/button'
import { useAdmin } from 'web/hooks/use-admin'
import { needsAdminToResolve } from 'web/pages/[username]/[contractSlug]'

export function AnswersPanel(props: {
  contract: FreeResponseContract | MultipleChoiceContract
}) {
  const isAdmin = useAdmin()
  const { contract } = props
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
            <OpenAnswer key={item.id} answer={item} contract={contract} />
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

      {outcomeType === 'FREE_RESPONSE' &&
        tradingAllowed(contract) &&
        (!resolveOption || resolveOption === 'CANCEL') && (
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
}) {
  const { answer, contract } = props
  const { username, avatarUrl, name, text } = answer
  const prob = getDpmOutcomeProbability(contract.totalShares, answer.id)
  const probPercent = formatPercent(prob)
  const [open, setOpen] = useState(false)

  return (
    <>
      <Modal open={open} setOpen={setOpen} position="center">
        <AnswerBetPanel
          answer={answer}
          contract={contract}
          closePanel={() => setOpen(false)}
          className="sm:max-w-84 !rounded-md bg-white !px-8 !py-6"
          isModal={true}
        />
      </Modal>

      <Row className="justify-between">
        <Col className="w-4/5">
          <Row>
            <Avatar
              className="my-auto mr-2 h-5 w-5"
              username={username}
              avatarUrl={avatarUrl}
            />
            <Linkify
              className="text-md whitespace-pre-line md:text-lg"
              text={text}
            />
          </Row>
          <div className="relative h-3">
            <hr className="bg-greyscale-2 absolute z-0 h-3 w-full rounded-full" />
            <hr
              className="absolute z-20 h-3 rounded-l-full bg-green-600 text-green-600"
              style={{ width: `${100 * Math.max(prob, 0.01)}%` }}
            />
          </div>
        </Col>
        <Row className="align-items items-center justify-end gap-4">
          <span
            className={clsx(
              'text-2xl',
              tradingAllowed(contract) ? 'text-greyscale-7' : 'text-gray-500'
            )}
          >
            {probPercent}
          </span>
          <Button
            className={clsx(tradingAllowed(contract) ? '' : '!hidden')}
            color="indigo"
            size="xs"
            onClick={() => setOpen(true)}
          >
            Buy
          </Button>
        </Row>
      </Row>
    </>
  )
}
