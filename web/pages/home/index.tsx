import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useTracking } from 'web/hooks/use-tracking'
import { useIsClient } from 'web/hooks/use-is-client'
import { FeedTimeline } from 'web/pages/feed-timeline'
import { NewsTopicsTabs } from 'web/components/news/news-topics-tabs'
import { DailyStats } from 'web/components/daily-stats'
import { Spacer } from 'web/components/layout/spacer'
import { ProfileSummary } from 'web/components/nav/profile-summary'
import { useUser } from 'web/hooks/use-user'
import MarketsHome from 'web/pages/markets-home'
import { Title } from 'web/components/widgets/title'
import Welcome from 'web/components/onboarding/welcome'
import { SEO } from 'web/components/SEO'

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
    <>
      <SEO
        title="News"
        description="Breaking news meets the wisdom of the crowd"
      />
      <Welcome />

      <Page>
        {/* TODO: Improve design of row on desktop. (Mobile is fine) */}
        <Row className="mx-4 mb-2 items-center justify-between gap-4">
          <div className="flex sm:hidden">
            {user ? <ProfileSummary user={user} /> : <Spacer w={4} />}
          </div>
          <Title className="!mb-0 hidden sm:flex">Home</Title>
          <DailyStats user={user} />
        </Row>

        <NewsTopicsTabs
          homeContent={<FeedTimeline />}
          questionsContent={<MarketsHome />}
        />
      </Page>
    </>
  )
}
