import { useState } from 'react'
import { RefreshIcon } from '@heroicons/react/outline'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { SocialComposer } from 'web/components/yap/social-composer'
import {
  SocialPostList,
  SocialPostSkeleton,
} from 'web/components/yap/social-post-list'
import { useIsAuthorized, usePrivateUser, useUser } from 'web/hooks/use-user'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'

export default function YapPage() {
  useRedirectIfSignedOut()
  const [version, setVersion] = useState(0)
  const user = useUser()
  const privateUser = usePrivateUser()
  const isAuthorized = useIsAuthorized()
  // Remount on account/block changes so a previous viewer's pages are never reused.
  const viewerKey = JSON.stringify([
    user?.id,
    privateUser?.blockedUserIds,
    privateUser?.blockedByUserIds,
  ])
  return (
    <Page trackPageView="yap page" hideFooter>
      <SEO
        title="Yap"
        description="Thoughts, markets, and conversations on Manifold."
        url="/yap"
      />
      <section
        aria-label="Yap"
        className="border-ink-200 dark:border-ink-300 mx-auto min-h-screen w-full max-w-2xl border-x"
      >
        <header className="bg-canvas-0/95 border-ink-200 dark:border-ink-300 sticky top-0 z-10 border-b backdrop-blur-md">
          <div className="flex items-center justify-between px-4 py-3">
            <h1 className="text-ink-900 text-xl font-bold">Yap</h1>
            <button
              aria-label="Refresh timeline"
              title="Refresh timeline"
              className="text-ink-600 hover:bg-ink-100 rounded-full p-2 transition-colors"
              onClick={() => setVersion((v) => v + 1)}
            >
              <RefreshIcon className="h-5 w-5" />
            </button>
          </div>
        </header>
        {isAuthorized && user && (
          <div className="border-ink-200 dark:border-ink-300 border-b">
            <SocialComposer onPosted={() => setVersion((v) => v + 1)} />
          </div>
        )}
        {!isAuthorized || !user ? (
          <SocialPostSkeleton />
        ) : (
          <SocialPostList key={viewerKey} refreshKey={version} />
        )}
      </section>
    </Page>
  )
}
