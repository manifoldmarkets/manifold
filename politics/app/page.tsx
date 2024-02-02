import { PoliticsPage } from 'politics/components/politics-page'
import { USElectionsPage } from 'politics/components/elections-page'
import {
  getElectionsPageProps,
  REVALIDATE_CONTRACTS_SECONDS,
} from 'web/lib/politics/home'
import {
  ELECTION_DASHBOARD_DESCRIPTION,
  ELECTION_DASHBOARD_TITLE,
} from 'common/politics/elections-data'
import { api } from 'web/lib/firebase/api'
import { HeadlineTabs } from 'politics/components/home-dashboard/news-sections'
import { unstable_cache } from 'next/cache'
import { HOUR_SECONDS } from 'common/util/time'
import { getDashboardProps } from 'web/lib/politics/news-dashboard'
import { NewsDashboard } from 'politics/components/home-dashboard/news-dashboard'

export const revalidate = REVALIDATE_CONTRACTS_SECONDS

export async function generateMetadata() {
  return {
    title: ELECTION_DASHBOARD_TITLE,
    description: ELECTION_DASHBOARD_DESCRIPTION,
    // TODO: add a nice preview image
  }
}

export default async function Page() {
  const props = await getElectionsPageProps(true)
  const headlines = await unstable_cache(
    async () => api('politics-headlines', {}),
    ['politics-headlines'],
    { revalidate: 12 * HOUR_SECONDS, tags: ['politics-headlines'] }
  )()
  const newsDashboards = await Promise.all(
    headlines.map(
      async (headline) =>
        await unstable_cache(
          () => getDashboardProps(headline.slug),
          [headline.slug],
          { revalidate: REVALIDATE_CONTRACTS_SECONDS, tags: [headline.slug] }
        )()
    )
  )

  return (
    <PoliticsPage trackPageView={'home'}>
      <div id={'#'} />
      <HeadlineTabs headlines={headlines} />
      <USElectionsPage {...props} />
      {newsDashboards.map((dashboard) =>
        dashboard.state === 'not found' ? null : (
          <NewsDashboard
            key={dashboard.slug + 'section'}
            {...(dashboard as any)}
          />
        )
      )}
    </PoliticsPage>
  )
}
