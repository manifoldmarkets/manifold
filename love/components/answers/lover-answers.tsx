import { NextRouter } from 'next/router'

import { Row as rowFor } from 'common/supabase/utils'
import { User } from 'common/user'
import { partition } from 'lodash'
import { Col } from 'web/components/layout/col'
import { FreeResponseDisplay } from './free-response-display'
import { OpinionScale } from './opinion-scale-display'

export function LoverAnswers(props: {
  isCurrentUser: boolean
  answers: rowFor<'love_answers'>[]
  router: NextRouter
  questions: rowFor<'love_questions'>[]
  user: User
}) {
  const { isCurrentUser, answers, router, questions, user } = props

  const [multiChoiceAnswers, otherAnswers] = partition(
    answers,
    (a) => a.multiple_choice != null
  )

  return (
    <Col className={'mt-2 gap-2'}>
      <OpinionScale
        multiChoiceAnswers={multiChoiceAnswers}
        questions={questions}
        isCurrentUser={isCurrentUser}
        router={router}
      />
      <FreeResponseDisplay
        answers={otherAnswers}
        questions={questions}
        isCurrentUser={isCurrentUser}
        router={router}
        user={user}
      />
    </Col>
  )
}
