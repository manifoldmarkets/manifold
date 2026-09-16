import { useState } from 'react'
import { ChatAlt2Icon, RefreshIcon } from '@heroicons/react/outline'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { SocialComposer } from 'web/components/yap/social-composer'
import { SocialPostList } from 'web/components/yap/social-post-list'

export default function YapPage() {
  const [version, setVersion] = useState(0)
  return (
    <Page trackPageView="yap page">
      <SEO
        title="Yap"
        description="Thoughts, markets, and conversations on Manifold."
        url="/yap"
      />
      <section
        aria-label="Yap"
        className="border-ink-100 mx-auto w-full max-w-2xl border-x"
      >
        <header className="border-ink-100 flex items-center gap-3 border-b px-4 py-5">
          <ChatAlt2Icon className="text-primary-600 h-7 w-7" />
          <div>
            <h1 className="text-ink-900 text-2xl font-bold">Yap</h1>
            <p className="text-ink-500 text-sm">
              One conversation. Everyone welcome.
            </p>
          </div>
          <button
            aria-label="Refresh timeline"
            className="text-ink-500 hover:text-primary-700 ml-auto p-2"
            onClick={() => setVersion((v) => v + 1)}
          >
            <RefreshIcon className="h-5 w-5" />
          </button>
        </header>
        <div className="border-ink-100 border-b-4">
          <SocialComposer onPosted={() => setVersion((v) => v + 1)} />
        </div>
        <SocialPostList refreshKey={version} />
      </section>
    </Page>
  )
}
