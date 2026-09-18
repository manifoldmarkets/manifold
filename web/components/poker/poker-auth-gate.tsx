import Head from 'next/head'
import { ReactNode } from 'react'
import { Page } from 'web/components/layout/page'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useIsAuthorized } from 'web/hooks/use-user'
import { Custom404Content } from 'web/pages/404'

export function PokerAuthGate({ children }: { children: ReactNode }) {
  const authorized = useIsAuthorized()
  if (authorized) return <>{children}</>

  // Don't mount poker content or its subscriptions until auth is confirmed.
  return (
    <Page trackPageView={false}>
      <Head>
        <title>
          {authorized === false ? '404: Oops!' : 'Loading…'} | Manifold
        </title>
        <meta name="robots" content="noindex,nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      {authorized === undefined ? (
        <LoadingIndicator className="py-16" />
      ) : (
        <Custom404Content />
      )}
    </Page>
  )
}
