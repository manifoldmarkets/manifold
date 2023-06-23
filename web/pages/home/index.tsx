import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useTracking } from 'web/hooks/use-tracking'
import { useIsClient } from 'web/hooks/use-is-client'
import { FeedTimeline } from 'web/pages/feed-timeline'
import { NewsTopicsTabs } from 'web/components/news-topics-tabs'
import { DailyStats } from 'web/components/daily-stats'
import { Spacer } from 'web/components/layout/spacer'
import { ProfileSummary } from 'web/components/nav/profile-summary'
import { useUser } from 'web/hooks/use-user'
import Search from 'web/pages/search'

export default function Home() {
  const isClient = useIsClient()

  useRedirectIfSignedOut()
  useSaveReferral()
  useTracking('view home', { kind: 'desktop' })

  if (!isClient)
    return (
      <Page>
        <LoadingIndicator className="mt-6" />
      </Page>
    )

  return <HomeDashboard />
}

function HomeDashboard() {
  const user = useUser()

  return (
    <Page>
      <Row className="mx-4 mb-0 items-center justify-between gap-4">
        <div className="flex sm:hidden">
          {user ? <ProfileSummary user={user} /> : <Spacer w={4} />}
        </div>
        <DailyStats user={user} />
      </Row>
      <NewsTopicsTabs
        homeContent={<FeedTimeline />}
        questionsContent={<Search />}
      />
    </Page>
  )
}
