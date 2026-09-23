import { useCallback, useEffect, useRef, useState } from 'react'
import { Page } from 'web/components/layout/page'
import { NoSEO } from 'web/components/NoSEO'
import { useUser } from 'web/hooks/use-user'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { api } from 'web/lib/api/api'
import type { MnxDashboard } from 'common/perps/management'
import { MnxDashboardView } from 'web/components/perps/mnx-dashboard'

export default function MnxPage() {
  useRedirectIfSignedOut()
  const user = useUser()
  return (
    <Page trackPageView="MNX dashboard">
      <NoSEO />
      {user ? (
        <MnxPageContent key={user.id} userId={user.id} />
      ) : (
        <p className="p-8">Sign in to manage MNX markets.</p>
      )}
    </Page>
  )
}

function MnxPageContent({ userId }: { userId: string }) {
  const [data, setData] = useState<MnxDashboard>()
  const [error, setError] = useState<string>()
  const [refreshing, setRefreshing] = useState(false)
  const active = useRef(true)
  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const next = await api('get-mnx-dashboard', {}, { cache: 'no-store' })
      if (active.current && next.payer.id === userId) {
        setData(next)
        setError(undefined)
      }
    } catch (error) {
      if (active.current)
        setError(error instanceof Error ? error.message : String(error))
    } finally {
      if (active.current) setRefreshing(false)
    }
  }, [userId])
  useEffect(() => {
    active.current = true
    void refresh()
    return () => {
      active.current = false
    }
  }, [refresh])
  return (
    <>
      {error && (
        <p
          role="alert"
          className="bg-scarlet-50 text-scarlet-700 m-4 rounded-lg p-4"
        >
          {error}{' '}
          <button className="underline" onClick={refresh}>
            Retry
          </button>
        </p>
      )}
      {data ? (
        <MnxDashboardView
          data={data}
          refresh={refresh}
          refreshing={refreshing}
        />
      ) : (
        !error && <p className="p-8">Loading MNX markets…</p>
      )}
    </>
  )
}
