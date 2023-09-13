import { Dashboard, DashboardItem } from 'common/dashboard'
import { getDashboardFromSlug } from 'common/supabase/dashboard'
import { useState } from 'react'
import { DashboardContent } from 'web/components/dashboard/dashboard-content'
import { DashboardSidebar } from 'web/components/dashboard/dashboard-sidebar'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'

export async function getStaticProps(ctx: {
  params: { dashboardSlug: string }
}) {
  const { dashboardSlug } = ctx.params
  const adminDb = await initSupabaseAdmin()

  try {
    const dashboard: Dashboard = await getDashboardFromSlug(
      dashboardSlug,
      adminDb
    )
    return { props: { dashboard } }
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

export default function DashboardPage(props: { dashboard: Dashboard }) {
  const { dashboard } = props
  const [items, setItems] = useState<DashboardItem[]>(dashboard.items)
  return (
    <Page
      trackPageView={'dashboard slug page'}
      trackPageProps={{ slug: dashboard.slug, title: dashboard.title }}
      rightSidebar={
        <DashboardSidebar description={dashboard.description} inSidebar />
      }
    >
      <Col className="items-center">
        <Col className="w-full max-w-2xl px-1 sm:px-2">
          <Title className="mt-4">{dashboard.title}</Title>
          <DashboardSidebar description={dashboard.description} />
          <DashboardContent
            items={dashboard.items}
            onRemove={(slugOrUrl: string) => {
              setItems((items) => {
                return items.filter((item) => {
                  if (item.type === 'question') {
                    return item.slug !== slugOrUrl
                  } else if (item.type === 'link') {
                    return item.url !== slugOrUrl
                  }
                  return true
                })
              })
            }}
          />
        </Col>
      </Col>
    </Page>
  )
}
