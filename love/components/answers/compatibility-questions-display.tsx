import { Col } from 'web/components/layout/col'
import { AddCompatibilityQuestionButton } from './add-compatibility-question-button'
import { Subtitle } from '../widgets/lover-subtitle'
import { User } from 'common/user'
import {
  QuestionWithCountType,
  useUserCompatibilityAnswers,
} from 'love/hooks/use-questions'
import { useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { isAdminId } from 'common/envs/constants'
import { AnswerCompatibilityQuestionButton } from './answer-compatibility-question-button'
import { partition } from 'lodash'

export function CompatibilityQuestionsDisplay(props: {
  isCurrentUser: boolean
  user: User
  allQuestions: QuestionWithCountType[]
  refreshQuestions: () => void
}) {
  const { isCurrentUser, user, allQuestions, refreshQuestions } = props
  const { refreshCompatibilityAnswers, compatibilityAnswers } =
    useUserCompatibilityAnswers(user.id)

  const answerQuestionIds = new Set(
    compatibilityAnswers.map((answer) => answer.question_id)
  )
  const [yourQuestions, otherQuestions] = partition(allQuestions, (question) =>
    answerQuestionIds.has(question.id)
  )

  const [expanded, setExpanded] = useState(false)
  const currentUser = useUser()

  return (
    <Col>
      <Subtitle>{`${
        isCurrentUser ? 'Your' : user.name.split(' ')[0] + `'s`
      } Compatibility Prompts`}</Subtitle>
      {yourQuestions.length <= 0 ? (
        <span className="text-ink-600 text-sm">
          You haven't answered any compatibility questions yet! Add some to
          better see who you'd be most compatible with.
        </span>
      ) : (
        <>
          {yourQuestions.map((question) => {
            return <div key={question.id}>{question.question}</div>
          })}
        </>
      )}
      {otherQuestions.length > 0 && (
        <AnswerCompatibilityQuestionButton
          user={user}
          otherQuestions={otherQuestions}
          refreshCompatibilityAnswers={refreshCompatibilityAnswers}
          refreshQuestions={refreshQuestions}
        />
      )}
      {(otherQuestions.length < 1 || isAdminId(user?.id)) && (
        <AddCompatibilityQuestionButton />
      )}
    </Col>
  )
}
