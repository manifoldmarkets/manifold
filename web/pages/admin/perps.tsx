import { isAdminId } from 'common/envs/constants'
import { Page } from 'web/components/layout/page'
import { NoSEO } from 'web/components/NoSEO'
import { useUser } from 'web/hooks/use-user'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { api } from 'web/lib/api/api'
import { PerpConsoleLoader } from 'web/components/perps/perp-management-console'

const loadPerpsConsole = () =>
  api('get-perps-dashboard', {}, { cache: 'no-store' })

export default function AdminPerpsPage() {
  useRedirectIfSignedOut()
  const user = useUser()
  return (
    <Page trackPageView="admin perps console">
      <NoSEO />
      {!user ? (
        <p className="p-8">Sign in to manage perp markets.</p>
      ) : !isAdminId(user.id) ? (
        <p className="p-8">Only admins can manage every perp market.</p>
      ) : (
        <PerpConsoleLoader
          key={user.id}
          scope="all"
          userId={user.id}
          load={loadPerpsConsole}
          loadingText="Loading perp markets…"
        />
      )}
    </Page>
  )
}
