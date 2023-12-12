import { QuestionWithCountType } from 'love/hooks/use-questions'
import { Row as rowFor } from 'common/supabase/utils'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import clsx from 'clsx'
import { User } from 'common/user'
import { Avatar } from 'web/components/widgets/avatar'
import { Tooltip } from 'web/components/widgets/tooltip'

export function PreferredList(props: {
  question: QuestionWithCountType
  answer: rowFor<'love_compatibility_answers'>
  comparedAnswer: rowFor<'love_compatibility_answers'>
  comparedUser: User
}) {
  const { question, answer, comparedAnswer, comparedUser } = props
  const { multiple_choice_options } = question
  if (!multiple_choice_options) return null
  const sortedEntries = Object.entries(multiple_choice_options).sort(
    (a, b) => a[1] - b[1]
  )

  return (
    <Col className="gap-2">
      {sortedEntries.map(([key, value]) => (
        <div
          key={key}
          className={clsx(
            answer.pref_choices?.includes(value)
              ? comparedAnswer.multiple_choice === value
                ? 'text-ink-1000  dark:text-ink-1000 '
                : 'text-ink-1000 dark:text-ink-1000'
              : 'opacity-20',
            'bg-canvas-50 relative w-fit gap-1 rounded py-2 pl-2 pr-8 text-sm'
          )}
        >
          {key}
          {comparedAnswer.multiple_choice === value && (
            <Avatar
              username={comparedUser.username}
              avatarUrl={comparedUser.avatarUrl}
              size="2xs"
              className=" ring-primary-500 absolute bottom-2 right-2 ring-2"
            />
          )}
        </div>
      ))}
    </Col>
  )
}
