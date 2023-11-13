import { track } from '@amplitude/analytics-browser'
import { PencilIcon } from '@heroicons/react/outline'
import { NextRouter } from 'next/router'

import { Row as rowFor } from 'common/supabase/utils'
import { User } from 'common/user'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Linkify } from 'web/components/widgets/linkify'
import { Subtitle } from '../widgets/lover-subtitle'

export function FreeResponseDisplay(props: {
  answers: rowFor<'love_answers'>[]
  questions: rowFor<'love_questions'>[]
  isCurrentUser: boolean
  router: NextRouter
  user: User
}) {
  const { answers, questions, isCurrentUser, router, user } = props
  return (
    <Col className="gap-2">
      <Row className={'w-full items-center justify-between gap-2'}>
        <Subtitle>{`About ${
          isCurrentUser ? 'You' : user.name.split(' ')[0]
        }`}</Subtitle>

        {isCurrentUser && answers.length > 0 && (
          <Button
            color={'gray-outline'}
            size="xs"
            className={''}
            onClick={() => {
              track('edit love questions')
              router.push('love-questions')
            }}
          >
            <PencilIcon className="mr-2 h-4 w-4" />
            Edit
          </Button>
        )}
      </Row>

      {answers.length > 0 ? (
        <Col className="gap-2">
          {answers.map((answer) => {
            return (
              <AnswerBlock
                key={answer.free_response ?? '' + answer.id}
                answer={answer}
                questions={questions}
              />
            )
          })}
        </Col>
      ) : isCurrentUser ? (
        <Col className="text-ink-600 gap-2 text-sm">
          You have not answered any questions yet! Help your potential matches
          get to know you better...
          <Button color="indigo" onClick={() => router.push('love-questions')}>
            Answer questions
          </Button>
        </Col>
      ) : (
        <div className="text-ink-600 gap-2 text-sm">None yet</div>
      )}
    </Col>
  )
}

function AnswerBlock(props: {
  answer: rowFor<'love_answers'>
  questions: rowFor<'love_questions'>[]
}) {
  const { answer, questions } = props
  const question = questions.find((q) => q.id === answer.question_id)
  if (!question) return null

  return (
    <Col
      key={question.id}
      className={
        'bg-canvas-0 flex-grow whitespace-pre-line rounded-md px-3 py-2 leading-relaxed'
      }
    >
      <Row className="text-ink-600 text-sm">{question.question}</Row>
      <Linkify
        className="text-lg"
        text={answer.free_response ?? answer.integer?.toString() ?? ''}
      />
    </Col>
  )
}
