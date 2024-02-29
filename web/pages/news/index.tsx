import { DashboardLinkItem, DashboardQuestionItem } from 'common/dashboard'
import { api, getDashboardFromSlug } from 'web/lib/firebase/api'
import Custom404 from '../404'
import { fetchLinkPreviews } from 'common/link-preview'
import { FoundDashboardPage } from 'web/components/dashboard/found-dashboard-page'
import { Page } from 'web/components/layout/page'
import { getContracts } from 'web/lib/supabase/contracts'
import { removeUndefinedProps } from 'common/util/object'
import { omit } from 'lodash'
import { NewsDashboardPageProps } from 'common/politics/elections-data'

// copied wholesale from /news/[slug].tsx TODO: refactor?

export async function getStaticProps() {
  // redirect to first news item
  const headlines = await api('headlines', {})

  const first = headlines[0]

  if (!first) {
    return {
      props: { state: 'not found' },
      revalidate: 60,
    }
  }

  const dashboard = await getDashboardFromSlug({ dashboardSlug: first.slug })

  const links = dashboard.items
    .filter((item): item is DashboardLinkItem => item.type === 'link')
    .map((item) => item.url)

  const questionSlugs = dashboard.items
    .filter((item): item is DashboardQuestionItem => item.type === 'question')
    .map((item) => item.slug)
    .slice(0, 20) // preload just the first n questions

  const previews = await fetchLinkPreviews(links)
  const fullContracts = await getContracts(questionSlugs, 'slug')
  const contracts = fullContracts.map((c) =>
    // remove some heavy fields that are not needed for the cards
    removeUndefinedProps(omit(c, 'description', 'coverImageUrl'))
  )

  return {
    props: {
      state: 'success',
      initialDashboard: dashboard,
      headlines,
      previews,
      initialContracts: contracts,
      slug: first.slug,
    },
  }
}

export default function News(props: NewsDashboardPageProps) {
  if (props.state === 'not found') {
    return <Custom404 />
  }

  return (
    <Page trackPageView={'news main'} className="items-center">
      <FoundDashboardPage {...props} editByDefault={false} endpoint={'news'} />
    </Page>
  )
}
