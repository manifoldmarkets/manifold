import { ProfitChangeTable } from 'web/components/contract/prob-change-table'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { LoadingIndicator } from 'web/components/loading-indicator'
import { Page } from 'web/components/page'
import { Title } from 'web/components/widgets/title'
import { useTracking } from 'web/hooks/use-tracking'
import { useUser, useUserContractMetricsByProfit } from 'web/hooks/use-user'
import { DailyProfit } from './home'

export default function DailyMovers() {
  const user = useUser()
  useTracking('view daily movers')

  return (
    <Page>
      <Col className="pm:mx-10 gap-4 sm:px-4 sm:pb-4">
        <Row className="mt-4 items-start justify-between sm:mt-0">
          <Title className="mx-4 !mb-0 !mt-0 sm:mx-0" text="Daily movers" />
          <DailyProfit user={user} />
        </Row>
        {user && <ProbChangesWrapper userId={user.id} />}
      </Col>
    </Page>
  )
}

function ProbChangesWrapper(props: { userId: string }) {
  const { userId } = props

  const data = useUserContractMetricsByProfit(userId)

  if (!data) return <LoadingIndicator />

  return <ProfitChangeTable contracts={data.contracts} metrics={data.metrics} />
}
