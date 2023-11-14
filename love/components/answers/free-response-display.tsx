import { PencilIcon } from '@heroicons/react/outline'
import { NextRouter } from 'next/router'

import { XIcon } from '@heroicons/react/outline'
import { Row as rowFor } from 'common/supabase/utils'
import { User } from 'common/user'
import { deleteAnswer } from 'love/lib/supabase/answers'
import { useState } from 'react'
import DropdownMenu from 'web/components/comments/dropdown-menu'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Linkify } from 'web/components/widgets/linkify'
import { IndividualQuestionRow } from '../questions-form'
import { Subtitle } from '../widgets/lover-subtitle'
import { AddQuestionButton } from './free-response-add-question'

export function FreeResponseDisplay(props: {
  answers: rowFor<'love_answers'>[]
  questions: rowFor<'love_questions'>[]
  isCurrentUser: boolean
  router: NextRouter
  user: User
  refreshAnswers: () => void
}) {
  const { answers, questions, isCurrentUser, refreshAnswers, user } = props

  const noAnswers = answers.length < 1

  if (noAnswers) {
    return (
      isCurrentUser && (
        <AddQuestionButton
          isFirstQuestion={answers.length < 1}
          answers={answers}
          questions={questions}
          user={user}
          refreshAnswers={refreshAnswers}
        />
      )
    )
  }
  return (
    <Col className="gap-2">
      <Row className={'w-full items-center justify-between gap-2'}>
        <Subtitle>{`${
          isCurrentUser ? 'Your' : user.name.split(' ')[0] + `'s`
        } Prompts`}</Subtitle>
      </Row>

      <Col className="gap-2">
        {answers.map((answer) => {
          return (
            <AnswerBlock
              key={answer.free_response ?? '' + answer.id}
              answer={answer}
              questions={questions}
              isCurrentUser={isCurrentUser}
              user={user}
              refreshAnswers={refreshAnswers}
            />
          )
        })}
      </Col>
      {isCurrentUser && (
        <AddQuestionButton
          isFirstQuestion={answers.length < 1}
          answers={answers}
          questions={questions}
          user={user}
          refreshAnswers={refreshAnswers}
        />
      )}
    </Col>
  )
}

function AnswerBlock(props: {
  answer: rowFor<'love_answers'>
  questions: rowFor<'love_questions'>[]
  isCurrentUser: boolean
  user: User
  refreshAnswers: () => void
}) {
  const { answer, questions, isCurrentUser, user, refreshAnswers } = props
  const question = questions.find((q) => q.id === answer.question_id)
  const [edit, setEdit] = useState(false)

  if (!question) return null

  return (
    <Col
      key={question.id}
      className={
        'bg-canvas-0 flex-grow whitespace-pre-line rounded-md px-3 py-2 leading-relaxed'
      }
    >
      <Row className="text-ink-600 justify-between text-sm">
        {question.question}
        {isCurrentUser && (
          <DropdownMenu
            items={[
              {
                name: 'Edit',
                icon: <PencilIcon className="h-5 w-5" />,
                onClick: () => setEdit(true),
              },
              {
                name: 'Delete',
                icon: <XIcon className="h-5 w-5" />,
                onClick: () =>
                  deleteAnswer(answer, user.id).then(() => refreshAnswers()),
              },
            ]}
            closeOnClick
          />
        )}
      </Row>
      {!edit && (
        <Linkify
          className="font-semibold"
          text={answer.free_response ?? answer.integer?.toString() ?? ''}
        />
      )}
      {edit && (
        <IndividualQuestionRow
          user={user}
          initialAnswer={answer}
          row={question}
          onCancel={() => {
            setEdit(false)
          }}
          onSubmit={() => {
            refreshAnswers()
            setEdit(false)
          }}
          className="mt-2"
        />
      )}
    </Col>
  )
}
