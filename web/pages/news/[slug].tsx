import { useRouter } from 'next/router'

import { Dashboard, DashboardLinkItem } from 'common/dashboard'
import { api, getDashboardFromSlug } from 'web/lib/firebase/api'
import Custom404 from '../404'
import { fetchLinkPreviews, LinkPreviews } from 'common/link-preview'
import { FoundDashboardPage } from 'web/components/dashboard/found-dashboard-page'
import { Page } from 'web/components/layout/page'
import { Headline } from 'common/news'

export async function getStaticProps(ctx: { params: { slug: string } }) {
  const { slug } = ctx.params
  try {
    const dashboard = await getDashboardFromSlug({ dashboardSlug: slug })
    const links = dashboard.items.filter(
      (item): item is DashboardLinkItem => item.type === 'link'
    )
    const previews = await fetchLinkPreviews(links.map((l) => l.url))

    const headlines = await api('headlines', {})

    return {
      props: {
        state: 'success',
        initialDashboard: dashboard,
        headlines,
        previews,
        slug,
      },
    }
  } catch (e) {
    if (typeof e === 'object' && e !== null && 'code' in e && e.code === 404) {
      return {
        props: { state: 'not found' },
        revalidate: 60,
      }
    }
    throw e
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function NewsPage(
  props:
    | {
        state: 'success'
        initialDashboard: Dashboard
        previews: LinkPreviews
        headlines: Headline[]
        slug: string
      }
    | { state: 'not found' }
) {
  const router = useRouter()
  const edit = !!router.query.edit

  if (props.state === 'not found') {
    return <Custom404 />
  } else {
    const { initialDashboard } = props
    return (
      <Page
        trackPageView={'dashboard slug page'}
        trackPageProps={{
          slug: initialDashboard.slug,
          title: initialDashboard.title,
        }}
        className="items-center"
      >
        <FoundDashboardPage {...props} editByDefault={edit} />
      </Page>
    )
  }
}
