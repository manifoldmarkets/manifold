import _ from 'lodash'
import { useLayoutEffect, useState } from 'react'

import { DPM, FreeResponse, FullContract } from '../../../common/contract'
import { Col } from '../layout/col'
import { useUser } from '../../hooks/use-user'
import { getDpmOutcomeProbability } from '../../../common/calculate-dpm'
import { useAnswers } from '../../hooks/use-answers'
import { tradingAllowed } from '../../lib/firebase/contracts'
import { AnswerItem } from './answer-item'
import { CreateAnswerPanel } from './create-answer-panel'
import { AnswerResolvePanel } from './answer-resolve-panel'
import { Spacer } from '../layout/spacer'
import { FeedItems } from '../feed/feed-items'
import { ActivityItem } from '../feed/activity-items'
import { useBets } from '../../hooks/use-bets'
import { Bet } from '../../../common/bet'
import { User } from '../../../common/user'
import { getOutcomeProbability } from '../../../common/calculate'
import { Answer } from '../../../common/answer'

export function AnswersPanel(props: {
  contract: FullContract<DPM, FreeResponse>
}) {
  const { contract } = props
  const { creatorId, resolution, resolutions, totalBets } = contract

  const answers = useAnswers(contract.id) ?? contract.answers
  const [winningAnswers, otherAnswers] = _.partition(
    answers.filter(
      (answer) => answer.id !== '0' && totalBets[answer.id] > 0.000000001
    ),
    (answer) =>
      answer.id === resolution || (resolutions && resolutions[answer.id])
  )
  const sortedAnswers = [
    ..._.sortBy(winningAnswers, (answer) =>
      resolutions ? -1 * resolutions[answer.id] : 0
    ),
    ..._.sortBy(
      resolution ? [] : otherAnswers,
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

  const chosenTotal = _.sum(Object.values(chosenAnswers))

  const answerItems = getAnswers(
    contract as FullContract<DPM, FreeResponse>,
    useBets(contract.id) || ([] as Bet[]),
    user
  ).reverse()

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
      {(resolveOption === 'CHOOSE' ||
        resolveOption === 'CHOOSE_MULTIPLE' ||
        resolution === 'MKT') &&
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

      {sortedAnswers.length === 0 && (
        <div className="pb-4 text-gray-500">No answers yet...</div>
      )}

      {!resolveOption && sortedAnswers.length > 0 && (
        <FeedItems
          contract={contract}
          items={answerItems}
          className={''}
          betRowClassName={''}
        />
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

function getAnswers(
  contract: FullContract<DPM, FreeResponse>,
  bets: Bet[],
  user: User | undefined | null
) {
  let outcomes = _.uniq(bets.map((bet) => bet.outcome)).filter(
    (outcome) => getOutcomeProbability(contract, outcome) > 0.0001
  )
  outcomes = _.sortBy(outcomes, (outcome) =>
    getOutcomeProbability(contract, outcome)
  )

  const answers = outcomes
    .map((outcome) => {
      const answer = contract.answers?.find(
        (answer) => answer.id === outcome
      ) as Answer

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

  return answers
}
