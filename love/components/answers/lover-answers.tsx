import { User } from 'common/user'
import { Col } from 'web/components/layout/col'
import { CompatibilityQuestionsDisplay } from './compatibility-questions-display'
import { FreeResponseDisplay } from './free-response-display'
import { Lover } from 'common/love/lover'

export function LoverAnswers(props: {
  isCurrentUser: boolean
  user: User
  lover: Lover
  fromSignup?: boolean
  fromLoverPage?: Lover
}) {
  const { isCurrentUser, user, fromSignup, fromLoverPage, lover } = props

  return (
    <Col className={'mt-2 gap-5'}>
      <CompatibilityQuestionsDisplay
        isCurrentUser={isCurrentUser}
        user={user}
        lover={lover}
        fromSignup={fromSignup}
        fromLoverPage={fromLoverPage}
      />
      <FreeResponseDisplay isCurrentUser={isCurrentUser} user={user} 
        fromLoverPage={fromLoverPage}
      />
    </Col>
  )
}
