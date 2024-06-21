import { useUser } from 'web/hooks/use-user'
import { Page } from 'web/components/layout/page'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { RegisterUserForm } from 'web/components/gidx/register-user-form'
import { GIDX_REGISTATION_ENABLED } from 'common/gidx/gidx'

const HomePage = () => {
  const user = useUser()
  if (!GIDX_REGISTATION_ENABLED) return null
  return (
    <Page trackPageView={'register user gidx'}>
      {!user ? <LoadingIndicator /> : <RegisterUserForm user={user} />}
    </Page>
  )
}

export default HomePage
