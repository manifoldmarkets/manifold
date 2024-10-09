import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { Page } from 'web/components/layout/page'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { RegisterUserForm } from 'web/components/gidx/register-user-form'

import { TWOMBA_ENABLED } from 'common/envs/constants'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { UsOnlyDisclaimer } from 'web/components/twomba/us-only-disclaimer'
import { Button } from 'web/components/buttons/button'
import { firebaseLogin } from 'web/lib/firebase/users'

const HomePage = () => {
  const user = useUser()
  const privateUser = usePrivateUser()
  if (!TWOMBA_ENABLED) return null
  return (
    <Page trackPageView={'register user gidx'}>
      <Col className="bg-canvas-0 relative mx-auto w-full max-w-lg gap-4 px-6 py-4">
        <Row className="w-full justify-end rounded">
          <UsOnlyDisclaimer />
        </Row>
        {!user ? (
          <Col className="items-center gap-4 text-lg font-semibold">
            Sign up to register
            <Button
              color="gradient"
              size="xl"
              onClick={firebaseLogin}
              className="w-fit"
            >
              Sign up
            </Button>
          </Col>
        ) : !privateUser ? (
          <LoadingIndicator className="mx-auto my-auto h-80" />
        ) : (
          <RegisterUserForm user={user} privateUser={privateUser} />
        )}
      </Col>
    </Page>
  )
}

export default HomePage
