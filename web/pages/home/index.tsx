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
import { FeedTimeline } from 'web/components/feed-timeline'
import { getNewsDashboards } from 'web/lib/firebase/api'
import { Dashboard } from 'common/dashboard'
import { isAdminId } from 'common/envs/constants'
import { EditNewsButton } from 'web/components/news/edit-news-button'

export async function getStaticProps() {
  const dashboards = await getNewsDashboards()

  return {
    props: {
      dashboards,
      revalidate: 4 * 60 * 60, // 4 hours
    },
  }
}

export default function Home(props: { dashboards: Dashboard[] }) {
  const isClient = useIsClient()

  useRedirectIfSignedOut()
  useSaveReferral()

  if (!isClient)
    return (
      <Page trackPageView={'home'} trackPageProps={{ kind: 'desktop' }}>
        <LoadingIndicator className="mt-6" />
      </Page>
    )

  return <HomeDashboard dashboards={props.dashboards} />
}

function HomeDashboard(props: { dashboards: Dashboard[] }) {
  const { dashboards } = props

  const user = useUser()

  return (
    <>
      <SEO
        title="News"
        description="Breaking news meets the wisdom of the crowd"
      />
      <Welcome />
      <Page trackPageView={'home'} trackPageProps={{ kind: 'desktop' }}>
        <Row className="mx-3 mb-2 items-center gap-4">
          <div className="flex md:hidden">
            {user ? <ProfileSummary user={user} /> : <Spacer w={4} />}
          </div>
          <Title className="!mb-0 hidden md:flex">Home</Title>
          {user && isAdminId(user.id) && (
            <EditNewsButton defaultDashboards={dashboards} />
          )}
          <DailyStats user={user} />
        </Row>

        <NewsTopicsTabs
          dashboards={dashboards}
          homeContent={<FeedTimeline />}
        />
      </Page>
    </>
  )
}
