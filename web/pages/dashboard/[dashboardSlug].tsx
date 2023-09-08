import { Dashboard } from 'common/dashboard'
import { getDashboardFromSlug } from 'common/supabase/dashboard'
import { DashboardSidebar } from 'web/components/dashboard/dashboard-sidebar'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { db } from 'web/lib/supabase/db'

export async function getStaticProps(ctx: {
  params: { dashboardSlug: string }
}) {
  const { dashboardSlug } = ctx.params

  try {
    const dashboard: Dashboard = await getDashboardFromSlug(dashboardSlug, db)
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
  return (
    <Page
      rightSidebar={
        <DashboardSidebar description={dashboard.description} inSidebar />
      }
    >
      <Col className="items-center">
        <Col className="w-full max-w-2xl px-1 sm:px-2">
          <Title className="mt-4">{dashboard.title}</Title>
          <DashboardSidebar description={dashboard.description} />
        </Col>
      </Col>
    </Page>
  )
}
