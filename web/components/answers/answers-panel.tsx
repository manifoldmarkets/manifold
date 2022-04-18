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
      otherAnswers,
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
      {resolveOption &&
        sortedAnswers.map((answer) => (
          <AnswerItem
            key={answer.id}
            answer={answer}
            contract={contract}
            user={user}
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

      {tradingAllowed(contract) && !resolveOption && (
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
