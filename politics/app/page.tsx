import type { Metadata } from 'next'
import { PoliticsPage } from 'politics/components/politics-page'
import Custom404 from 'politics/app/404/page'
import { getDashboardFromSlug } from 'web/lib/firebase/api'
import { DashboardLinkItem } from 'common/dashboard'
import { FoundDashboardPage } from 'web/pages/dashboard/found-dashboard-page'
import { cache } from 'react'
import { fetchLinkPreviews } from 'common/link-preview'
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

  return (
    <PoliticsPage trackPageView={'home'}>
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
