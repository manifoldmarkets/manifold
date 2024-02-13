import { useOtherAnswers } from 'love/hooks/use-other-answers'
import { QuestionWithCountType } from 'love/hooks/use-questions'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { RawAvatar } from 'web/components/widgets/avatar'
import { Linkify } from 'web/components/widgets/linkify'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { RawUserLink } from 'web/components/widgets/user-link'
import { Gender, convertGender } from '../gender-icon'
import { capitalize } from 'lodash'
import clsx from 'clsx'
import { shortenedFromNow } from 'web/lib/util/shortenedFromNow'

export function OtherLoverAnswers(props: {
  question: QuestionWithCountType
  className?: string
}) {
  const { question, className } = props
  const otherAnswers = useOtherAnswers(question.id)
  const shownAnswers = otherAnswers?.filter(
    (a) => a.multiple_choice != null || a.free_response || a.integer
  )

  if (otherAnswers === undefined) return <LoadingIndicator />
  if (
    (otherAnswers === null ||
      otherAnswers.length ||
      !shownAnswers ||
      shownAnswers.length === 0) === 0
  )
    return <div>No answers yet!</div>

  return (
    <Col className={clsx('gap-2', className)}>
      {shownAnswers?.map((otherAnswer) => {
        const answerUser = otherAnswer.data
        return (
          <Col
            key={answerUser.id}
            className="bg-canvas-50 gap-2 rounded px-4 py-2"
          >
            <Row className="w-full justify-between">
              <Row className="text-ink-500 items-center gap-2">
                <RawAvatar
                  username={answerUser.username}
                  avatarUrl={answerUser.avatarUrl}
                  size="sm"
                />
                <Col>
                  <span className="text-sm">
                    <RawUserLink user={answerUser} />, {otherAnswer.age}
                  </span>
                  <Row className="gap-1 text-xs">
                    {otherAnswer.city} •{' '}
                    {capitalize(convertGender(otherAnswer.gender as Gender))}
                  </Row>
                </Col>
              </Row>
              <div className="text-ink-400 text-xs">
                {shortenedFromNow(otherAnswer.created_time)}
              </div>
            </Row>
            <Linkify
              className="text-sm"
              text={
                otherAnswer.free_response ??
                otherAnswer.multiple_choice ??
                otherAnswer.integer
              }
            />
          </Col>
        )
      })}
    </Col>
  )
}
