import { PencilAltIcon } from '@heroicons/react/solid'
import Router from 'next/router'
import clsx from 'clsx'

import { SEO } from 'web/components/SEO'
import { DailyStats } from 'web/components/home/daily-stats'
import { Page } from 'web/components/layout/page'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { GroupPageContent } from '../browse/[[...slug]]'
import { useSaveReferral } from 'web/hooks/use-save-referral'

export default function Home() {
  const user = useUser()
  useSaveReferral(user)

  return (
    <Page trackPageView={'home'} className="!mt-0">
      <SEO title={`Home`} description={`Browse all questions`} url={`/home`} />
      {user && (
        <DailyStats
          className="bg-canvas-50 z-50 mb-1 w-full px-2 py-2"
          user={user}
        />
      )}
      <GroupPageContent
        slug={''}
        staticTopicParams={undefined}
        collapseOptions
      />
      {user && (
        <button
          type="button"
          className={clsx(
            'focus:ring-primary-500 fixed  right-3 z-20 inline-flex items-center rounded-full border  border-transparent  p-4 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 lg:hidden',
            'disabled:bg-ink-300 text-ink-0 from-primary-500 hover:from-primary-700 to-blue-500 hover:to-blue-700 enabled:bg-gradient-to-r',
            'bottom-[64px]'
          )}
          onClick={() => {
            Router.push('/create')
            track('mobile create button')
          }}
        >
          <PencilAltIcon className="h-6 w-6" aria-hidden="true" />
        </button>
      )}
    </Page>
  )
}
