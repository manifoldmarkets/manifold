import { track } from 'web/lib/service/analytics'
import { PencilAltIcon } from '@heroicons/react/solid'
import clsx from 'clsx'

import { DailyStats } from 'web/components/home/daily-stats'
import { Page } from 'web/components/layout/page'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/firebase/api'
import { Headline } from 'common/news'
import { HeadlineTabs } from 'web/components/dashboard/header'
import { WelcomeTopicSections } from 'web/components/home/welcome-topic-sections'
import { useNewUserMemberTopicsAndContracts } from 'web/hooks/use-group-supabase'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { DAY_MS } from 'common/util/time'
import { useSaveScroll } from 'web/hooks/use-save-scroll'
import Router from 'next/router'
import { Col } from 'web/components/layout/col'
import { User } from 'common/user'
import { LiveGeneratedFeed } from 'web/components/feed/live-generated-feed'

export async function getStaticProps() {
  try {
    const headlines = await api('headlines', {})
    return {
      props: {
        headlines,
        revalidate: 30 * 60, // 30 minutes
      },
    }
  } catch (err) {
    return { props: { headlines: [] }, revalidate: 60 }
  }
}

export default function Home(props: { headlines: Headline[] }) {
  useRedirectIfSignedOut()
  const user = useUser()
  useSaveReferral(user)
  useSaveScroll('home')

  const { headlines } = props
  return (
    <Page
      trackPageView={'home'}
      trackPageProps={{ kind: 'desktop' }}
      className=" !mt-0"
      banner={null}
    >
      <HeadlineTabs
        endpoint={'news'}
        headlines={headlines}
        currentSlug={'home'}
        hideEmoji
      />
      {!user ? <LoadingIndicator /> : <HomeContent user={user} />}
    </Page>
  )
}

export function HomeContent(props: { user: User | undefined | null }) {
  const { user } = props

  const welcomeTopicsEnabled = (user?.createdTime ?? 0) > Date.now() - DAY_MS
  const memberTopicsWithContracts = useNewUserMemberTopicsAndContracts(
    user,
    welcomeTopicsEnabled
  )

  if (welcomeTopicsEnabled && !memberTopicsWithContracts) {
    return <LoadingIndicator />
  }
  return (
    <Col className="w-full items-center self-center pb-4 sm:px-2">
      {user && (
        <DailyStats
          className="bg-canvas-50 z-50 mb-1 w-full px-2 pb-2 pt-1 sm:sticky sm:top-9"
          user={user}
        />
      )}

      {user && (
        <Col className={clsx('w-full sm:px-2')}>
          {welcomeTopicsEnabled && memberTopicsWithContracts && (
            <WelcomeTopicSections
              memberTopicsWithContracts={memberTopicsWithContracts}
            />
          )}

          <LiveGeneratedFeed userId={user.id} />
        </Col>
      )}
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
    </Col>
  )
}
