import { track } from '@amplitude/analytics-browser'
import { NextRouter } from 'next/router'
import { PencilIcon } from '@heroicons/react/outline'

import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Subtitle } from '../widgets/lover-subtitle'
import { Row as rowFor } from 'common/supabase/utils'
import { Button } from 'web/components/buttons/button'
import { Linkify } from 'web/components/widgets/linkify'
import { capitalize, orderBy, partition } from 'lodash'
import { MultipleChoiceColors } from 'common/love/multiple-choice'
import clsx from 'clsx'
import { OpinionScale } from './opinion-scale-display'
import { FreeResponseDisplay } from './free-response-display'
import { User } from 'common/user'

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
