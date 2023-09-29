import { SEO } from 'web/components/SEO'
import { DailyStats } from 'web/components/daily-stats'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { ProfileSummary } from 'web/components/nav/profile-summary'
import { NewsTopicsTabs } from 'web/components/news/news-topics-tabs'
import Welcome from 'web/components/onboarding/welcome'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Title } from 'web/components/widgets/title'
import { useIsClient } from 'web/hooks/use-is-client'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useUser } from 'web/hooks/use-user'
import { FeedTimeline } from 'web/pages/feed-timeline'

export default function Home() {
  const isClient = useIsClient()

  useRedirectIfSignedOut()
  useSaveReferral()

  if (!isClient)
    return (
      <Page trackPageView={'home'} trackPageProps={{ kind: 'desktop' }}>
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
      <Page
        trackPageView={'home'}
        trackPageProps={{ kind: 'desktop' }}
        manifestBannerEnabled
      >
        <Row className="mx-4 mb-2 items-center justify-between gap-4">
          <div className="flex sm:hidden">
            {user ? <ProfileSummary user={user} /> : <Spacer w={4} />}
          </div>
          <Title className="!mb-0 hidden sm:flex">Home</Title>
          <DailyStats user={user} />
        </Row>

        <NewsTopicsTabs homeContent={<FeedTimeline />} />
      </Page>
    </>
  )
}
