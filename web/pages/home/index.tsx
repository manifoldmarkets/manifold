import { SEO } from 'web/components/SEO'
import { DailyStats } from 'web/components/daily-stats'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { ProfileSummary } from 'web/components/nav/profile-summary'
import { NewsTopicsTabs } from 'web/components/news/news-topics-tabs'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Title } from 'web/components/widgets/title'
import { useIsClient } from 'web/hooks/use-is-client'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useUser } from 'web/hooks/use-user'
import { FeedTimeline } from 'web/components/feed-timeline'
import { getNewsDashboards } from 'web/lib/firebase/api'
import { Dashboard, DashboardLinkItem } from 'common/dashboard'
import { isAdminId, isModId } from 'common/envs/constants'
import { EditNewsButton } from 'web/components/news/edit-news-button'
import { useYourFollowedDashboards } from 'web/hooks/use-dashboard'
import { buildArray } from 'common/util/array'
import { uniqBy } from 'lodash'
import { LinkPreviews, fetchLinkPreviews } from 'common/link-preview'
import { Onboarding } from 'web/components/onboarding/onboarding'
import { ErrorBoundary } from 'react-error-boundary'
import Welcome from 'web/components/onboarding/welcome'
import { useIsBetOnboardingTest } from 'web/hooks/use-is-bet-onboarding-test'
import { useRouter } from 'next/router'

export async function getStaticProps() {
  const dashboards = (await getNewsDashboards()) as Dashboard[]
  const links = dashboards.flatMap((d) =>
    d.items.filter((item): item is DashboardLinkItem => item.type === 'link')
  )

  const previews = await fetchLinkPreviews(links.map((l) => l.url))

  return {
    props: {
      dashboards,
      previews,
      revalidate: 4 * 60 * 60, // 4 hours
    },
  }
}

export default function Home(props: {
  dashboards: Dashboard[]
  previews: LinkPreviews
}) {
  const isClient = useIsClient()

  useRedirectIfSignedOut()
  useSaveReferral()

  if (!isClient)
    return (
      <Page trackPageView={'home'} trackPageProps={{ kind: 'desktop' }}>
        <LoadingIndicator className="mt-6" />
      </Page>
    )

  return <HomeDashboard {...props} />
}

function HomeDashboard(props: {
  dashboards: Dashboard[]
  previews: LinkPreviews
}) {
  const { dashboards, previews } = props
  const bettingOnboarding = useIsBetOnboardingTest()

  const router = useRouter()
  const { forceOnboarding } = router.query

  const user = useUser()
  const myDashboards = useYourFollowedDashboards()

  return (
    <>
      <SEO
        title="News"
        description="Breaking news meets the wisdom of the crowd"
      />
      {bettingOnboarding || forceOnboarding ? (
        <ErrorBoundary fallback={null}>
          <Onboarding />
        </ErrorBoundary>
      ) : (
        <Welcome />
      )}

      <Page trackPageView={'home'} trackPageProps={{ kind: 'desktop' }}>
        <Row className="mx-3 mb-2 items-center gap-4">
          <div className="flex md:hidden">
            {user ? <ProfileSummary user={user} /> : <Spacer w={4} />}
          </div>
          <Title className="!mb-0 hidden md:flex">Home</Title>
          {user && (isAdminId(user.id) || isModId(user.id)) && (
            <EditNewsButton defaultDashboards={dashboards} />
          )}
          <DailyStats user={user} />
        </Row>

        <NewsTopicsTabs
          dashboards={uniqBy(buildArray(myDashboards, dashboards), 'id')}
          previews={previews}
          homeContent={<FeedTimeline />}
        />
      </Page>
    </>
  )
}
