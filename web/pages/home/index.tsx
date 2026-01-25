import { PencilAltIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import Router from 'next/router'

import { SEO } from 'web/components/SEO'
import { DailyStats } from 'web/components/home/daily-stats'
import { Page } from 'web/components/layout/page'
import { DowntimeBanner, ShopBanner } from 'web/components/nav/banner'
import { Welcome } from 'web/components/onboarding/welcome'
import { VerificationResultModal } from 'web/components/onboarding/verification-result-modal'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { BrowsePageContent } from '../browse'
export default function Home() {
  const user = useUser()
  useSaveReferral(user)
  useRedirectIfSignedOut()

  return (
    <Page trackPageView={'home'} className="lg:px-4">
      <Welcome />
      <VerificationResultModal />
      <SEO title={`Home`} description={`Browse all questions`} url={`/home`} />
      <DowntimeBanner />
      <ShopBanner />
      <DailyStats className="z-50 mb-1 w-full px-2 py-2" user={user} />
      <BrowsePageContent />
      {user && (
        <button
          type="button"
          className={clsx(
            'focus:ring-primary-500 fixed right-3 z-20 inline-flex items-center gap-2 rounded-full border border-transparent px-4 py-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 lg:hidden',
            'disabled:bg-ink-300 text-ink-0 from-primary-500 hover:from-primary-700 to-blue-500 hover:to-blue-700 enabled:bg-gradient-to-r',
            'bottom-[64px]'
          )}
          onClick={() => {
            Router.push('/create')
            track('mobile create button')
          }}
        >
          <PencilAltIcon className="h-5 w-5" aria-hidden="true" />
          <span className="font-semibold">Create</span>
        </button>
      )}
      {/* Preload feed */}
      {/* {user && <LiveGeneratedFeed userId={user.id} hidden />} */}
      {/* {user && <ExploreContent render={false} />} */}
    </Page>
  )
}
