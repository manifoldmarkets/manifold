import { Dashboard, DashboardItem } from 'common/dashboard'
import { getDashboardFromSlug } from 'common/supabase/dashboard'
import { getUserFollowsDashboard } from 'common/supabase/dashboard-follows'
import { useState } from 'react'
import { FaBookmark, FaRegBookmark } from 'react-icons/fa6'
import { DashboardContent } from 'web/components/dashboard/dashboard-content'
import { DashboardSidebar } from 'web/components/dashboard/dashboard-sidebar'
import { FollowDashboardButton } from 'web/components/dashboard/follow-dashboard-button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Title } from 'web/components/widgets/title'
import { useUserFollowsDashboard } from 'web/hooks/use-dashboard-follows'
import { useUser } from 'web/hooks/use-user'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import { db } from 'web/lib/supabase/db'

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
  const user = useUser()
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
          <Row className="w-full items-center justify-between">
            <Title className="mt-4">{dashboard.title}</Title>
            <FollowDashboardButton
              dashboardId={dashboard.id}
              dashboardCreatorId={dashboard.creator_id}
            />
          </Row>
          <DashboardSidebar description={dashboard.description} />
          <DashboardContent
            items={items}
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
