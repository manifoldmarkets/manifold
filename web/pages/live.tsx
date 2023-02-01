import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { useTracking } from 'web/hooks/use-tracking'
import { ActivityLog } from 'web/components/activity-log'

export default function LivePage() {
  useTracking('view live page')

  return (
    <Page>
      <Col className="pm:mx-10 gap-4 sm:px-4 sm:pb-4">
        <Title className="!mb-0">Live feed</Title>
        <ActivityLog count={30} showPills />
      </Col>
    </Page>
  )
}
