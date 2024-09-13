import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { Page } from 'web/components/layout/page'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { RegisterUserForm } from 'web/components/gidx/register-user-form'

import { TWOMBA_ENABLED } from 'common/envs/constants'
import { Col } from 'web/components/layout/col'

const HomePage = () => {
  const user = useUser()
  const privateUser = usePrivateUser()
  if (!TWOMBA_ENABLED) return null
  return (
    <Page trackPageView={'register user gidx'}>
      <Col className="mx-auto max-w-lg gap-4 px-6 py-4">
        {!user || !privateUser ? (
          <LoadingIndicator />
        ) : (
          <RegisterUserForm user={user} privateUser={privateUser} />
        )}
      </Col>
    </Page>
  )
}

export default HomePage
