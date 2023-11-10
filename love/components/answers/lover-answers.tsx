import { NextRouter } from 'next/router'

import { Row as rowFor } from 'common/supabase/utils'
import { User } from 'common/user'
import { partition } from 'lodash'
import { Col } from 'web/components/layout/col'
import { FreeResponseDisplay } from './free-response-display'
import { OpinionScale } from './opinion-scale-display'
import { useUserAnswersAndQuestions } from 'love/hooks/use-questions'
import { useState } from 'react'

export function LoverAnswers(props: {
  isCurrentUser: boolean
  router: NextRouter
  user: User
}) {
  const { isCurrentUser, router, user } = props

  const [refresh, setRefresh] = useState<number>(0)

  const { questions, answers: allAnswers } = useUserAnswersAndQuestions(
    user?.id,
    refresh
  )

  const answers = allAnswers.filter(
    (a) => a.multiple_choice != null || a.free_response || a.integer
  )

  const [multiChoiceAnswers, otherAnswers] = partition(
    answers,
    (a) => a.multiple_choice != null
  )

  function refreshAnswers() {
    console.log('HIIIII')
    setRefresh((prevRefresh) => prevRefresh + 1)
  }

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
        refreshAnswers={refreshAnswers}
      />
    </Col>
  )
}
