import _ from 'lodash'
import { useLayoutEffect, useState } from 'react'

import { Answer } from '../../../common/answer'
import { Contract } from '../../../common/contract'
import { Col } from '../layout/col'
import { formatPercent } from '../../../common/util/format'
import { useUser } from '../../hooks/use-user'
import { getOutcomeProbability } from '../../../common/calculate'
import { useAnswers } from '../../hooks/use-answers'
import { tradingAllowed } from '../../lib/firebase/contracts'
import { AnswerItem } from './answer-item'
import { CreateAnswerPanel } from './create-answer-panel'
import { AnswerResolvePanel } from './answer-resolve-panel'

export function AnswersPanel(props: { contract: Contract; answers: Answer[] }) {
  const { contract } = props
  const { creatorId, resolution, resolutions, pool } = contract

  const answers = useAnswers(contract.id) ?? props.answers
  const [winningAnswers, otherAnswers] = _.partition(
    answers.filter((answer) => answer.id !== '0' && pool[answer.id] > 0),
    (answer) =>
      answer.id === resolution || (resolutions && resolutions[answer.id])
  )
  const sortedAnswers = [
    ..._.sortBy(winningAnswers, (answer) =>
      resolutions ? -1 * resolutions[answer.id] : 0
    ),
    ..._.sortBy(
      otherAnswers,
      (answer) => -1 * getOutcomeProbability(contract.totalShares, answer.id)
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
      {sortedAnswers.map((answer) => (
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

      {sortedAnswers.length === 0 ? (
        <div className="text-gray-500 p-4">No answers yet...</div>
      ) : (
        <div className="text-gray-500 self-end p-4">
          None of the above:{' '}
          {formatPercent(getOutcomeProbability(contract.totalShares, '0'))}
        </div>
      )}

      {tradingAllowed(contract) && !resolveOption && (
        <CreateAnswerPanel contract={contract} />
      )}

      {user?.id === creatorId && !resolution && (
        <AnswerResolvePanel
          contract={contract}
          resolveOption={resolveOption}
          setResolveOption={setResolveOption}
          chosenAnswers={chosenAnswers}
        />
      )}
    </Col>
  )
}
