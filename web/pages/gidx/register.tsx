import { useUser } from 'web/hooks/use-user'
import { Page } from 'web/components/layout/page'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { RegisterUserForm } from 'web/components/gidx/register-user-form'

const HomePage = () => {
  const user = useUser()

  return (
    <Page trackPageView={'register user gidx'}>
      {!user ? <LoadingIndicator /> : <RegisterUserForm user={user} />}
    </Page>
  )
}

export default HomePage
