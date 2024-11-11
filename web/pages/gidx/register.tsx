import { RegisterUserForm } from 'web/components/gidx/register-user-form'
import { Page } from 'web/components/layout/page'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { usePrivateUser, useUser } from 'web/hooks/use-user'

import { ageBlocked, locationBlocked } from 'common/gidx/user'
import { PrivateUser, User } from 'common/user'
import { RiUserForbidLine } from 'react-icons/ri'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { UsOnlyDisclaimer } from 'web/components/sweeps/us-only-disclaimer'
import { useMonitorStatus } from 'web/hooks/use-monitor-status'
import { firebaseLogin } from 'web/lib/firebase/users'
import { LocationBlockedIcon } from 'web/public/custom-components/locationBlockedIcon'

const HomePage = () => {
  const user = useUser()
  const privateUser = usePrivateUser()

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

export function RefreshStatusButton(props: { user: User }) {
  const { user } = props
  const {
    requestLocationThenFetchMonitorStatus,
    loading: loadingMonitorStatus,
    monitorStatusMessage,
    monitorStatus,
  } = useMonitorStatus(false, user)
  return (
    <>
      <Button
        color={'gray-outline'}
        loading={loadingMonitorStatus}
        disabled={loadingMonitorStatus}
        onClick={() => requestLocationThenFetchMonitorStatus()}
        className={'mt-2 w-fit'}
      >
        Refresh status
      </Button>
      {monitorStatus === 'error' && (
        <Row className={'text-error'}>{monitorStatusMessage}</Row>
      )}
    </>
  )
}

// ASSUMING:
// verification status failed
// should not prompt user verification
// has not yet tried to verify
export function VerificationBlockedReasons(props: {
  user: User
  privateUser: PrivateUser
  message: string
}) {
  const { user, privateUser, message } = props

  if (locationBlocked(user, privateUser)) {
    return (
      <Col className="items-center gap-4">
        <Col className="items-center gap-4">
          <LocationBlockedIcon height={16} className="fill-red-500" />
          <Col className="gap-2">
            <div className="text-2xl">Your location is blocked!</div>
            <p className="text-ink-700">
              You are unable to verify at the moment.
            </p>
          </Col>
        </Col>

        <RefreshStatusButton user={user} />
      </Col>
    )
  }

  if (ageBlocked(user, privateUser)) {
    return (
      <Col className="items-center gap-4">
        <RiUserForbidLine className="h-16 w-16 shrink-0 fill-red-500" />
        <Col className="gap-2">
          <div className="text-2xl">You must be 18+</div>
          <p className="text-ink-700">
            You are unable to verify at the moment.
          </p>
        </Col>
      </Col>
    )
  }

  return (
    <Col className="items-center gap-4">
      <RiUserForbidLine className="h-16 w-16 shrink-0 fill-red-500" />
      <Col className="gap-2">
        <div className="text-2xl">{message}</div>
        <p className="text-ink-700">You are unable to verify at the moment.</p>
      </Col>
      <RefreshStatusButton user={user} />
    </Col>
  )
}

export default HomePage
