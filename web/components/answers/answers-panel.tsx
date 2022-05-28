import { sortBy, partition, sum, uniq } from 'lodash'
import { useLayoutEffect, useState } from 'react'

import { Contract, FreeResponse } from 'common/contract'
import { Col } from '../layout/col'
import { useUser } from 'web/hooks/use-user'
import { getDpmOutcomeProbability } from 'common/calculate-dpm'
import { useAnswers } from 'web/hooks/use-answers'
import { tradingAllowed } from 'web/lib/firebase/contracts'
import { AnswerItem } from './answer-item'
import { CreateAnswerPanel } from './create-answer-panel'
import { AnswerResolvePanel } from './answer-resolve-panel'
import { Spacer } from '../layout/spacer'
import { ActivityItem } from '../feed/activity-items'
import { User } from 'common/user'
import { getOutcomeProbability } from 'common/calculate'
import { Answer } from 'common/answer'
import clsx from 'clsx'
import { formatPercent } from 'common/util/format'
import { Modal } from 'web/components/layout/modal'
import { AnswerBetPanel } from 'web/components/answers/answer-bet-panel'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/avatar'
import { UserLink } from 'web/components/user-page'
import { Linkify } from 'web/components/linkify'
import { BuyButton } from 'web/components/yes-no-selector'

export function AnswersPanel(props: { contract: Contract & FreeResponse }) {
  const { contract } = props
  const { creatorId, resolution, resolutions, totalBets } = contract

  const answers = useAnswers(contract.id) ?? contract.answers
  const [winningAnswers, losingAnswers] = partition(
    answers.filter(
      (answer) => answer.id !== '0' && totalBets[answer.id] > 0.000000001
    ),
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

  const user = useUser()

  const [resolveOption, setResolveOption] = useState<
    'CHOOSE' | 'CHOOSE_MULTIPLE' | 'CANCEL' | undefined
  >()
  const [chosenAnswers, setChosenAnswers] = useState<{
    [answerId: string]: number
  }>({})

  const chosenTotal = sum(Object.values(chosenAnswers))

  const answerItems = getAnswerItems(
    contract,
    losingAnswers.length > 0 ? losingAnswers : sortedAnswers,
    user
  )

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
        <div className={clsx('flow-root pr-2 md:pr-0')}>
          <div className={clsx(tradingAllowed(contract) ? '' : '-mb-6')}>
            {answerItems.map((item, activityItemIdx) => (
              <div key={item.id} className={'relative pb-2'}>
                <div className="relative flex items-start space-x-3">
                  <OpenAnswer {...item} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {answers.length <= 1 && (
        <div className="pb-4 text-gray-500">No answers yet...</div>
      )}

      {tradingAllowed(contract) &&
        (!resolveOption || resolveOption === 'CANCEL') && (
          <CreateAnswerPanel contract={contract} />
        )}

      {user?.id === creatorId && !resolution && (
        <>
          <Spacer h={2} />
          <AnswerResolvePanel
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

function getAnswerItems(
  contract: Contract & FreeResponse,
  answers: Answer[],
  user: User | undefined | null
) {
  let outcomes = uniq(answers.map((answer) => answer.number.toString())).filter(
    (outcome) => getOutcomeProbability(contract, outcome) > 0.0001
  )
  outcomes = sortBy(outcomes, (outcome) =>
    getOutcomeProbability(contract, outcome)
  ).reverse()

  return outcomes
    .map((outcome) => {
      const answer = answers.find((answer) => answer.id === outcome) as Answer
      //unnecessary
      return {
        id: outcome,
        type: 'answer' as const,
        contract,
        answer,
        items: [] as ActivityItem[],
        user,
      }
    })
    .filter((group) => group.answer)
}

function OpenAnswer(props: {
  contract: Contract & FreeResponse
  answer: Answer
  items: ActivityItem[]
  type: string
}) {
  const { answer, contract } = props
  const { username, avatarUrl, name, text } = answer
  const prob = getDpmOutcomeProbability(contract.totalShares, answer.id)
  const probPercent = formatPercent(prob)
  const [open, setOpen] = useState(false)

  return (
    <Col className={'border-base-200 bg-base-200 flex-1 rounded-md px-2'}>
      <Modal open={open} setOpen={setOpen}>
        <AnswerBetPanel
          answer={answer}
          contract={contract}
          closePanel={() => setOpen(false)}
          className="sm:max-w-84 !rounded-md bg-white !px-8 !py-6"
          isModal={true}
        />
      </Modal>

      <div
        className="pointer-events-none absolute -mx-2 h-full rounded-tl-md bg-green-600 bg-opacity-10"
        style={{ width: `${100 * Math.max(prob, 0.01)}%` }}
      />

      <Row className="my-4 gap-3">
        <div className="px-1">
          <Avatar username={username} avatarUrl={avatarUrl} />
        </div>
        <Col className="min-w-0 flex-1 lg:gap-1">
          <div className="text-sm text-gray-500">
            <UserLink username={username} name={name} /> answered
          </div>

          <Col className="align-items justify-between gap-4 sm:flex-row">
            <span className="whitespace-pre-line text-lg">
              <Linkify text={text} />
            </span>

            <Row className="items-center justify-center gap-4">
              <div className={'align-items flex w-full justify-end gap-4 '}>
                <span
                  className={clsx(
                    'text-2xl',
                    tradingAllowed(contract) ? 'text-primary' : 'text-gray-500'
                  )}
                >
                  {probPercent}
                </span>
                <BuyButton
                  className={clsx(
                    'btn-sm flex-initial !px-6 sm:flex',
                    tradingAllowed(contract) ? '' : '!hidden'
                  )}
                  onClick={() => setOpen(true)}
                />
              </div>
            </Row>
          </Col>
        </Col>
      </Row>
    </Col>
  )
}
