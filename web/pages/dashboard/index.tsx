import { DASHBOARD_ENABLED } from 'common/envs/constants'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useTracking } from 'web/hooks/use-tracking'
import Custom404 from '../404'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useUser } from 'web/hooks/use-user'
import Create from '../create'
import { CreateDashboardButton } from 'web/components/dashboard/create-dashboard-button'

export default function DashboardPage() {
  useRedirectIfSignedOut()

  if (!DASHBOARD_ENABLED) {
    return <Custom404 />
  }

  const user = useUser()

  return (
    <Page>
      <Col className="items-center">
        <Col className="w-full max-w-2xl px-4 sm:px-2">
          <Row className="mt-1 mb-3 items-start justify-between">
            <span className={'text-primary-600 text-2xl'}>Dashboards</span>
            {user && <CreateDashboardButton />}
          </Row>
          {/* <GroupsPageContent user={user} /> */}
        </Col>
      </Col>
    </Page>
  )
}
