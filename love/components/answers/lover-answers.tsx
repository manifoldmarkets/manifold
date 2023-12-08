import { User } from 'common/user'
import { Col } from 'web/components/layout/col'
import { CompatibilityQuestionsDisplay } from './compatibility-questions-display'
import { FreeResponseDisplay } from './free-response-display'

export function LoverAnswers(props: {
  isCurrentUser: boolean
  user: User
  fromSignup?: boolean
}) {
  const { isCurrentUser, user, fromSignup } = props

  return (
    <Col className={'mt-2 gap-5'}>
      <CompatibilityQuestionsDisplay
        isCurrentUser={isCurrentUser}
        user={user}
        fromSignup={fromSignup}
      />
      <FreeResponseDisplay
        isCurrentUser={isCurrentUser}
        user={user}
      />
    </Col>
  )
}
