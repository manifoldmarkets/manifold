import { QuestionWithCountType } from 'love/hooks/use-questions'
import { Row as rowFor } from 'common/supabase/utils'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import clsx from 'clsx'
import { User } from 'common/user'
import { shortenName } from 'web/components/widgets/user-link'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/outline'

export function PreferredList(props: {
  question: QuestionWithCountType
  answer: rowFor<'love_compatibility_answers'>
  comparedAnswer: rowFor<'love_compatibility_answers'>
  comparedUser: User
  isComparedUser?: boolean
}) {
  const { question, answer, comparedAnswer, comparedUser, isComparedUser } =
    props
  const { multiple_choice_options } = question
  if (!multiple_choice_options) return null
  const sortedEntries = Object.entries(multiple_choice_options).sort(
    (a, b) => a[1] - b[1]
  )
  const comparedUserIsCompatible = answer.pref_choices?.includes(
    comparedAnswer.multiple_choice
  )

  return (
    <Col className="gap-2">
      {sortedEntries.map(([key, value]) => (
        <Row key={key} className="items-center gap-2 text-sm">
          <div
            key={key}
            className={clsx(
              answer.pref_choices?.includes(value)
                ? 'text-ink-1000  dark:text-ink-1000'
                : comparedAnswer.multiple_choice === value
                ? 'opacity-20'
                : 'hidden',
              'bg-canvas-50 relative w-2/3 gap-1 rounded py-2 pl-2 pr-8'
            )}
          >
            {key}
          </div>
          {comparedAnswer.multiple_choice === value && (
            <Row
              className={clsx(
                'items-center gap-0.5 text-xs',
                comparedUserIsCompatible ? 'text-teal-700' : 'text-scarlet-700'
              )}
            >
              {comparedUserIsCompatible ? (
                <CheckCircleIcon className="h-4 w-4" />
              ) : (
                <XCircleIcon className="h-4 w-4" />
              )}
              {isComparedUser ? 'Your' : shortenName(comparedUser.name) + "'s"}{' '}
              answer
            </Row>
          )}
        </Row>
      ))}
    </Col>
  )
}

export function PreferredListNoComparison(props: {
  question: QuestionWithCountType
  answer: rowFor<'love_compatibility_answers'>
}) {
  const { question, answer } = props
  const { multiple_choice_options } = question
  if (!multiple_choice_options) return null
  const sortedEntries = Object.entries(multiple_choice_options).sort(
    (a, b) => a[1] - b[1]
  )
  return (
    <Col className="gap-2">
      {sortedEntries.map(([key, value]) => (
        <Row key={key} className="items-center gap-2 text-sm">
          <div
            key={key}
            className={clsx(
              answer.pref_choices?.includes(value)
                ? 'text-ink-1000  dark:text-ink-1000'
                : 'hidden',
              'bg-canvas-50 relative w-2/3 gap-1 rounded py-2 pl-2 pr-8'
            )}
          >
            {key}
          </div>
        </Row>
      ))}
    </Col>
  )
}
