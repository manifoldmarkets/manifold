import { useUser } from 'web/hooks/use-user'
import { Page } from 'web/components/layout/page'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { UserInfo } from 'web/components/gidx/user-info'

const HomePage = () => {
  const user = useUser()

  return (
    <Page trackPageView={'register user gidx'}>
      {!user ? <LoadingIndicator /> : <UserInfo user={user} />}
    </Page>
  )
}

export default HomePage
