import { User } from 'common/user'
import { partition } from 'lodash'
import {
  useQuestionsWithAnswerCount,
  useUserAnswers,
} from 'love/hooks/use-questions'
import { Col } from 'web/components/layout/col'
import { FreeResponseDisplay } from './free-response-display'
import { OpinionScale } from './opinion-scale-display'
import { AddCompatibilityQuestionButton } from './add-compatibility-question-button'

export function LoverAnswers(props: { isCurrentUser: boolean; user: User }) {
  const { isCurrentUser, user } = props

  const { refreshAnswers, answers: allAnswers } = useUserAnswers(user?.id)

  const answers = allAnswers.filter(
    (a) => a.multiple_choice != null || a.free_response || a.integer
  )

  const answerQuestionIds = new Set(answers.map((answer) => answer.question_id))

  const questionsWithCount = useQuestionsWithAnswerCount()

  const [yourQuestions, otherQuestions] = partition(
    questionsWithCount,
    (question) => answerQuestionIds.has(question.id)
  )

  const [multiChoiceAnswers, otherAnswers] = partition(
    answers,
    (a) => a.multiple_choice != null
  )

  return (
    <Col className={'mt-2 gap-5'}>
      <FreeResponseDisplay
        answers={otherAnswers}
        yourQuestions={yourQuestions}
        otherQuestions={otherQuestions}
        isCurrentUser={isCurrentUser}
        user={user}
        refreshAnswers={refreshAnswers}
      />
      <OpinionScale
        multiChoiceAnswers={multiChoiceAnswers}
        questions={questionsWithCount}
        isCurrentUser={isCurrentUser}
      />
      <AddCompatibilityQuestionButton />
    </Col>
  )
}
