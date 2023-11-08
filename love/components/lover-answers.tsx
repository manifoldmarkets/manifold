import { track } from '@amplitude/analytics-browser'
import { NextRouter } from 'next/router'
import { PencilIcon } from '@heroicons/react/outline'

import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Subtitle } from './widgets/lover-subtitle'
import { Row as rowFor } from 'common/supabase/utils'
import { Button } from 'web/components/buttons/button'
import { Linkify } from 'web/components/widgets/linkify'
import { capitalize, orderBy } from 'lodash'
import { MultipleChoiceColors } from 'common/love/multiple-choice'
import clsx from 'clsx'

export function LoverAnswers(props: {
  isCurrentUser: boolean
  answers: rowFor<'love_answers'>[]
  router: NextRouter
  questions: rowFor<'love_questions'>[]
}) {
  const { isCurrentUser, answers, router, questions } = props

  const multiChoiceAnswers = answers.filter((a) => a.multiple_choice != null)
  return (
    <Col className={'mt-2 gap-2'}>
      <Row className={'items-center gap-2'}>
        <Subtitle>Answers</Subtitle>

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
      {/* <Row className={'flex-wrap gap-3'}> */}
      {answers.length > 0 ? (
        <MultipleChoiceAnswers
          multiChoiceAnswers={multiChoiceAnswers}
          questions={questions}
        />
      ) : // orderBy(
      //   answers,
      //   (a) => (a.free_response ? 3 : a.multiple_choice ? 2 : 1),
      //   'desc'
      // ).map((answer) => {
      //   const question = questions.find((q) => q.id === answer.question_id)
      //   if (!question) return null
      //   const options = question.multiple_choice_options as Record<
      //     string,
      //     number
      //   >
      //   const optionKey = options
      //     ? Object.keys(options).find(
      //         (k) => options[k] === answer.multiple_choice
      //       )
      //     : null

      //   return (
      //     <Col
      //       key={question.id}
      //       className={
      //         'bg-canvas-0 flex-grow whitespace-pre-line rounded-md px-3 py-2 leading-relaxed'
      //       }
      //     >
      //       <Row className={'font-semibold'}>{question.question}</Row>
      //       <Linkify
      //         text={
      //           answer.free_response ??
      //           optionKey ??
      //           answer.integer?.toString() ??
      //           ''
      //         }
      //       />
      //     </Col>
      //   )
      // })
      isCurrentUser ? (
        <Col className={'text-ink-600 w-full gap-2 text-sm'}>
          No answers yet. Answer some questions to help your matches get to know
          you!
          {/* <Row> */}
          <Button
            color="gradient"
            onClick={() => router.push('love-questions')}
          >
            Answer questions
          </Button>
          {/* </Row> */}
        </Col>
      ) : (
        <span className={'text-ink-500 text-sm'}>Nothing yet :(</span>
      )}
      {/* </Row> */}
    </Col>
  )
}

function MultipleChoiceAnswers(props: {
  multiChoiceAnswers: rowFor<'love_answers'>[]
  questions: rowFor<'love_questions'>[]
}) {
  const { multiChoiceAnswers, questions } = props
  if (multiChoiceAnswers.length === 0) return null
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {orderBy(multiChoiceAnswers, (a) => a.multiple_choice, 'desc').map(
        (answer) => {
          const question = questions.find((q) => q.id === answer.question_id)
          const multiChoiceAnswer = answer.multiple_choice
          const colorsLength = MultipleChoiceColors.length
          if (!question) return null
          const options = question.multiple_choice_options as Record<
            string,
            number
          >
          const optionKey = options
            ? Object.keys(options).find((k) => options[k] === multiChoiceAnswer)
            : null

          if (!optionKey || multiChoiceAnswer == null) return null

          return (
            <Col
              className={clsx(
                `${MultipleChoiceColors[multiChoiceAnswer % colorsLength]}`,
                'rounded bg-opacity-20 px-4 py-1'
              )}
            >
              {question.question}
              <div
                className={clsx(
                  'text-ink-600 w-full text-xs',
                  multiChoiceAnswer % colorsLength == 0
                    ? 'text-rose-600'
                    : multiChoiceAnswer % colorsLength == 1
                    ? 'text-rose-500'
                    : multiChoiceAnswer % colorsLength == 2
                    ? 'text-stone-500'
                    : multiChoiceAnswer % colorsLength == 3
                    ? 'text-teal-500'
                    : 'text-teal-600'
                )}
              >
                {capitalize(optionKey)}
              </div>
            </Col>
          )
        }
      )}
    </div>
  )
}
