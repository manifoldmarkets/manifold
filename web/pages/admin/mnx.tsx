import { Page } from 'web/components/layout/page'
import { NoSEO } from 'web/components/NoSEO'
import { useUser } from 'web/hooks/use-user'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { api } from 'web/lib/api/api'
import {
  mnxConsoleData,
  PerpConsoleLoader,
} from 'web/components/perps/perp-management-console'

const loadMnxConsole = async () =>
  mnxConsoleData(await api('get-mnx-dashboard', {}, { cache: 'no-store' }))

export default function MnxPage() {
  useRedirectIfSignedOut()
  const user = useUser()
  return (
    <Page trackPageView="MNX dashboard">
      <NoSEO />
      {user ? (
        <PerpConsoleLoader
          key={user.id}
          scope="mnx"
          userId={user.id}
          load={loadMnxConsole}
          loadingText="Loading MNX markets…"
        />
      ) : (
        <p className="p-8">Sign in to manage MNX markets.</p>
      )}
    </Page>
  )
}
