import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { Page } from 'web/components/layout/page'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { RegisterUserForm } from 'web/components/gidx/register-user-form'

import { TWOMBA_ENABLED } from 'common/envs/constants'

const HomePage = () => {
  const user = useUser()
  const privateUser = usePrivateUser()
  if (!TWOMBA_ENABLED) return null
  return (
    <Page trackPageView={'register user gidx'}>
      {!user || !privateUser ? (
        <LoadingIndicator />
      ) : (
        <RegisterUserForm user={user} privateUser={privateUser} />
      )}
    </Page>
  )
}

export default HomePage
