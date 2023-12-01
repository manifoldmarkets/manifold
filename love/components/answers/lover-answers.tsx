import { User } from 'common/user'
import { partition } from 'lodash'
import {
  useQuestionsWithAnswerCount,
  useUserAnswers,
} from 'love/hooks/use-questions'
import { Col } from 'web/components/layout/col'
import { CompatibilityQuestionsDisplay } from './compatibility-questions-display'
import { FreeResponseDisplay } from './free-response-display'

export function LoverAnswers(props: { isCurrentUser: boolean; user: User }) {
  const { isCurrentUser, user } = props

  const { refreshAnswers, answers: allAnswers } = useUserAnswers(user?.id)

  const answers = allAnswers.filter(
    (a) => a.multiple_choice != null || a.free_response || a.integer
  )

  const answerQuestionIds = new Set(answers.map((answer) => answer.question_id))

  const { refreshQuestions, questionsWithCount } = useQuestionsWithAnswerCount()

  const freeResponseQuestions = questionsWithCount.filter(
    (q) => q.answer_type == 'free_response'
  )

  const compatibilityQuestions = questionsWithCount.filter(
    (q) => q.answer_type == 'compatibility_multiple_choice'
  )

  const [yourFRQuestions, otherFRQuestions] = partition(
    freeResponseQuestions,
    (question) => answerQuestionIds.has(question.id)
  )

  const [_multiChoiceAnswers, otherAnswers] = partition(
    answers,
    (a) => a.multiple_choice != null
  )

  return (
    <Col className={'mt-2 gap-5'}>
      <CompatibilityQuestionsDisplay
        isCurrentUser={isCurrentUser}
        user={user}
        allQuestions={compatibilityQuestions}
        refreshQuestions={refreshQuestions}
      />
      <FreeResponseDisplay
        answers={otherAnswers}
        yourQuestions={yourFRQuestions}
        otherQuestions={otherFRQuestions}
        isCurrentUser={isCurrentUser}
        user={user}
        refreshAnswers={refreshAnswers}
      />
    </Col>
  )
}
