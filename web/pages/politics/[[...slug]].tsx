import {
  ElectionsPageProps,
  NewsDashboardPageProps,
  SuccesNewsDashboardPageProps,
} from 'web/public/data/elections-data'
import { getElectionsPageProps } from 'web/lib/politics/home'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { useUser } from 'web/hooks/use-user'
import { capitalize, first } from 'lodash'
import { Col } from 'web/components/layout/col'
import { getDashboardProps } from 'web/lib/politics/news-dashboard'
import { USElectionsPage } from 'web/components/elections-page'
import Custom404 from 'web/pages/404'
import NewsPage from 'web/pages/news/[slug]'
import { PoliticsDashboardPage } from 'web/components/dashboard/politics-dashboard-page'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useSaveContractVisitsLocally } from 'web/hooks/use-save-visits'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'
import { useMultiDashboard } from 'web/hooks/use-multi-dashboard'
import { MultiDashboardHeadlineTabs } from 'web/components/dashboard/multi-dashboard-header'

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}
const revalidate = 60
const ENDPOINT = 'politics'
const TOP_SLUG = 'home'
export async function getStaticProps(props: { params: { slug: string[] } }) {
  const slug = first(props.params.slug)
  if (slug) {
    try {
      const props = await getDashboardProps(slug, {
        topSlug: TOP_SLUG,
        slug: ENDPOINT,
      })
      return {
        props,
        revalidate,
      }
    } catch (e) {
      return {
        props: { state: 'not found' },
        revalidate,
      }
    }
  }
  const electionsPageProps = await getElectionsPageProps()
  electionsPageProps.headlines.unshift({
    id: TOP_SLUG,
    slug: TOP_SLUG,
    title: capitalize(TOP_SLUG),
  })
  return {
    props: electionsPageProps,
    revalidate,
  }
}

export default function ElectionsOrDashboardPage(
  props: ElectionsPageProps | NewsDashboardPageProps
) {
  const user = useUser()
  useSaveReferral(user)
  // mark US prez contract as seen to ensure US Politics group is auto-selected during onboarding
  useSaveContractVisitsLocally(user === null, 'ikSUiiNS8MwAI75RwEJf')
  useSaveCampaign()

  // Unknown politics dashboard
  if ('state' in props && props.state === 'not found') {
    return <Custom404 />
  }
  // Politics dashboard
  if ('initialDashboard' in props) {
    return <NewsPage {...props} endpoint={ENDPOINT} />
  }
  // Elections home page
  return <Elections {...props} />
}

// Note: I previously saw INSUFFICIENT_RESOURCES errors when trying to render all the dashboards
const MAX_DASHBOARDS = 8

function Elections(props: ElectionsPageProps) {
  const newsDashboards = props.newsDashboards.slice(0, MAX_DASHBOARDS)
  const headlines = props.headlines.slice(0, MAX_DASHBOARDS)
  const { currentSlug, headlineSlugsToRefs, onClick } = useMultiDashboard(
    headlines,
    ENDPOINT,
    TOP_SLUG
  )
  return (
    <Page trackPageView="us elections page 2024">
      <SEO
        title="Manifold 2024 Election Forecast"
        description="Live prediction market odds on the 2024 US election"
        image="/election-map24.png"
      />

      <MultiDashboardHeadlineTabs
        headlines={headlines}
        currentSlug={currentSlug}
        onClick={onClick}
        endpoint={ENDPOINT}
        topSlug={TOP_SLUG}
      />
      <div
        className="absolute top-1"
        ref={headlineSlugsToRefs.current[TOP_SLUG]}
      />

      <USElectionsPage {...props} />

      {newsDashboards.map((dashboard) =>
        dashboard.state === 'not found' ? null : (
          <Col className={'relative my-4'} key={dashboard.slug + 'section'}>
            <div
              className={'absolute -top-12'}
              ref={headlineSlugsToRefs.current[dashboard.slug]}
            />
            <PoliticsDashboardPage
              {...(dashboard as SuccesNewsDashboardPageProps)}
              editByDefault={false}
              embeddedInParent={true}
              endpoint={ENDPOINT}
              className="!max-w-none"
            />
          </Col>
        )
      )}
    </Page>
  )
}
