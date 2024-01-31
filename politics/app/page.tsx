import { PoliticsPage } from 'politics/components/politics-page'
import { USElectionsPage } from 'web/components/elections-page'
import { getDashboardProps } from 'web/lib/politics/dashboard'
import {
  ELECTION_DASHBOARD_DESCRIPTION,
  ELECTION_DASHBOARD_TITLE,
} from 'common/politics/elections-data'
import { api } from 'web/lib/firebase/api'
import { HeadlineTabs } from 'politics/components/home-dashboard/news-sections'
import { unstable_cache } from 'next/cache'
import { HOUR_MS } from 'common/util/time'

export async function generateMetadata() {
  return {
    title: ELECTION_DASHBOARD_TITLE,
    description: ELECTION_DASHBOARD_DESCRIPTION,
    // TODO: add a nice preview image
  }
}

export default async function Page() {
  const props = await getDashboardProps(true)
  const headlines = await unstable_cache(
    async () => api('politics-headlines', {}),
    ['politics-headlines'],
    { revalidate: 4 * HOUR_MS, tags: ['politics-headlines'] }
  )()

  return (
    <PoliticsPage trackPageView={'home'}>
      <HeadlineTabs headlines={headlines} />
      <USElectionsPage {...props} />
    </PoliticsPage>
  )
}
