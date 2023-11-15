import { NextRouter } from 'next/router'

import { User } from 'common/user'
import { partition } from 'lodash'
import { useUserAnswersAndQuestions } from 'love/hooks/use-questions'
import { Col } from 'web/components/layout/col'
import { FreeResponseDisplay } from './free-response-display'
import { OpinionScale } from './opinion-scale-display'

export function LoverAnswers(props: {
  isCurrentUser: boolean
  user: User
}) {
  const { isCurrentUser, user } = props

  const {
    questions: allQuestions,
    answers: allAnswers,
    refreshAnswersAndQuestions,
  } = useUserAnswersAndQuestions(user?.id)

  const answers = allAnswers.filter(
    (a) => a.multiple_choice != null || a.free_response || a.integer
  )

  const answerQuestionIds = new Set(answers.map((answer) => answer.question_id))

  const questions = allQuestions.filter((question) =>
    answerQuestionIds.has(question.id)
  )

  const [multiChoiceAnswers, otherAnswers] = partition(
    answers,
    (a) => a.multiple_choice != null
  )

  return (
    <Col className={'mt-2 gap-5'}>
      <FreeResponseDisplay
        answers={otherAnswers}
        questions={questions}
        isCurrentUser={isCurrentUser}
        user={user}
        refreshAnswers={refreshAnswersAndQuestions}
      />
      <OpinionScale
        multiChoiceAnswers={multiChoiceAnswers}
        questions={questions}
        isCurrentUser={isCurrentUser}
      />
    </Col>
  )
}
