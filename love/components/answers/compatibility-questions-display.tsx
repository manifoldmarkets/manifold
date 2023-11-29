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
import { Row } from 'web/components/layout/row'
import { Row as rowFor } from 'common/supabase/utils'
import {
  IMPORTANCE_CHOICES,
  IMPORTANCE_DISPLAY_COLORS,
} from './answer-compatibility-question-content'
import clsx from 'clsx'
import { CheckCircleIcon } from '@heroicons/react/outline'
import { Linkify } from 'web/components/widgets/linkify'

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
    <Col className="gap-2">
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
          {compatibilityAnswers.map((answer) => {
            return (
              <CompatibilityAnswerBlock
                key={answer.question_id}
                answer={answer}
                yourQuestions={yourQuestions}
              />
            )
          })}
        </>
      )}
      {otherQuestions.length >= 1 && (
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

function CompatibilityAnswerBlock(props: {
  answer: rowFor<'love_compatibility_answers'>
  yourQuestions: QuestionWithCountType[]
}) {
  const { answer, yourQuestions } = props
  console.log(answer)
  const question = yourQuestions.find((q) => q.id === answer.question_id)
  if (
    !question ||
    !question.multiple_choice_options ||
    answer.multiple_choice == null
  )
    return null

  const answerText = getStringKeyFromNumValue(
    answer.multiple_choice,
    question.multiple_choice_options as Record<string, number>
  )

  return (
    <Col
      className={
        'bg-canvas-0 flex-grow gap-1 whitespace-pre-line rounded-md px-3 py-2 leading-relaxed'
      }
    >
      <div className="text-ink-600 text-sm">{question.question}</div>
      <Row className="bg-canvas-50 items-center gap-1 rounded px-2 py-1 text-sm">
        <CheckCircleIcon className="text-ink-600 h-4 w-4 shrink-0" />
        {answerText}
      </Row>
      {answer.explanation && (
        <Linkify className="font-semibold" text={answer.explanation} />
      )}
    </Col>
  )
}

function ImportanceDisplay(props: { importance: number | null }) {
  const { importance } = props

  if (importance == null) return null
  const importanceText = getStringKeyFromNumValue(
    importance,
    IMPORTANCE_CHOICES
  )
  return (
    <span
      className={clsx(
        IMPORTANCE_DISPLAY_COLORS[importance],
        'text-ink-800 rounded bg-opacity-50 px-1.5 py-0.5 text-xs'
      )}
    >
      {importanceText}
    </span>
  )
}

function getStringKeyFromNumValue(
  value: number,
  map: Record<string, number>
): string | undefined {
  const choices = Object.keys(map) as (keyof typeof map)[]
  return choices.find((choice) => map[choice] === value)
}
