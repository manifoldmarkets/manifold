import { DASHBOARD_ENABLED } from 'common/envs/constants'
import { CreateDashboardButton } from 'web/components/dashboard/create-dashboard-button'
import { DashboardSearch } from 'web/components/dashboard/dashboard-search'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useUser } from 'web/hooks/use-user'
import Custom404 from '../404'

export default function DashboardPage() {
  useRedirectIfSignedOut()
  const user = useUser()

  return (
    <Page trackPageView={'dashboards page'}>
      <Col className="items-center">
        <Col className="w-full max-w-2xl px-4 sm:px-2">
          <Row className="mt-1 mb-3 items-start justify-between">
            <span className={'text-primary-600 text-2xl'}>Dashboards</span>
            {user && <CreateDashboardButton />}
          </Row>
          <DashboardSearch />
        </Col>
      </Col>
    </Page>
  )
}
