import type { Metadata } from 'next'
import { PoliticsPage } from 'politics/components/politics-page'
import Custom404 from 'politics/app/404/page'
import { getDashboardFromSlug } from 'web/lib/firebase/api'
import { DashboardLinkItem } from 'common/dashboard'
import FoundDashboardPage from 'web/pages/dashboard/found-dashboard-page'
import { cache } from 'react'
import { fetchLinkPreviews } from 'common/link-preview'
import {
  StateElectionMap,
  StateElectionMarket,
} from 'politics/components/usa-map/state-election-map'
const dashboardSlug = '2024-us-election-updates'

export const revalidate = 60 // revalidate at most in seconds

export async function generateMetadata(): Promise<Metadata> {
  const dashboard = await getDashboardFromSlugCached({ dashboardSlug })
  if (!dashboard) return { title: 'Not found' }
  const links = dashboard.items.filter(
    (item): item is DashboardLinkItem => item.type === 'link'
  )

  return {
    title: dashboard.title,
    openGraph: {
      images: links.map((l) => l.url),
    },
  }
}

export default async function Page() {
  const dashboard = await getDashboardFromSlugCached({ dashboardSlug })
  if (!dashboard) return <Custom404 />
  const links = dashboard.items.filter(
    (item): item is DashboardLinkItem => item.type === 'link'
  )
  // It'd be nice if we could cache these previews, but this doesn't use fetch, see: https://nextjs.org/docs/app/building-your-application/caching#data-cache
  const previews = await fetchLinkPreviews(links.map((l) => l.url))
  const senateMidterms: StateElectionMarket[] = [
    {
      state: 'AZ',
      creatorUsername: 'BTE',
      slug: 'will-blake-masters-win-the-arizona',
      isWinRepublican: true,
    },
    {
      state: 'OH',
      creatorUsername: 'BTE',
      slug: 'will-jd-vance-win-the-ohio-senate-s',
      isWinRepublican: true,
    },
    {
      state: 'WI',
      creatorUsername: 'BTE',
      slug: 'will-ron-johnson-be-reelected-in-th',
      isWinRepublican: true,
    },
    {
      state: 'FL',
      creatorUsername: 'BTE',
      slug: 'will-marco-rubio-be-reelected-to-th',
      isWinRepublican: true,
    },
    {
      state: 'PA',
      creatorUsername: 'MattP',
      slug: 'will-dr-oz-be-elected-to-the-us-sen',
      isWinRepublican: true,
    },
    {
      state: 'GA',
      creatorUsername: 'NcyRocks',
      slug: 'will-a-democrat-win-the-2022-us-sen-3d2432ba6d79',
      isWinRepublican: false,
    },
    {
      state: 'NV',
      creatorUsername: 'NcyRocks',
      slug: 'will-a-democrat-win-the-2022-us-sen',
      isWinRepublican: false,
    },
    {
      state: 'NC',
      creatorUsername: 'NcyRocks',
      slug: 'will-a-democrat-win-the-2022-us-sen-6f1a901e1fcf',
      isWinRepublican: false,
    },
    {
      state: 'NH',
      creatorUsername: 'NcyRocks',
      slug: 'will-a-democrat-win-the-2022-us-sen-23194a72f1b7',
      isWinRepublican: false,
    },
    {
      state: 'UT',
      creatorUsername: 'SG',
      slug: 'will-mike-lee-win-the-2022-utah-sen',
      isWinRepublican: true,
    },
  ]

  return (
    <PoliticsPage trackPageView={'home'}>
      <StateElectionMap markets={senateMidterms} />
      <FoundDashboardPage
        previews={previews}
        initialDashboard={dashboard}
        editByDefault={false}
        slug={dashboardSlug}
      />
    </PoliticsPage>
  )
}

const getDashboardFromSlugCached = cache(getDashboardFromSlug)
