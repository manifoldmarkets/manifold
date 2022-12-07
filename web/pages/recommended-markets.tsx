import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { useTracking } from 'web/hooks/use-tracking'
import { useUser, useUserRecommendedMarkets } from 'web/hooks/use-user'
import { DailyProfit } from '../components/daily-stats'
import { ContractsGrid } from 'web/components/contract/contracts-grid'
import { memo } from 'react'

export default function RecommendedMarkets() {
  const user = useUser()
  useTracking('view recommended markets')

  return (
    <Page>
      <Col className="pm:mx-10 gap-4 sm:px-4 sm:pb-4">
        <Row className="mt-4 items-start justify-between sm:mt-0">
          <Title
            className="mx-4 !mb-0 !mt-0 sm:mx-0"
            text="Your recommended markets"
          />
          <DailyProfit user={user} />
        </Row>
        {user && <RecommendedMarketsItems userId={user.id} />}
      </Col>
    </Page>
  )
}

const RecommendedMarketsItems = memo(function RecommendedMarketsItems(props: {
  userId: string
}) {
  const { userId } = props

  const data = useUserRecommendedMarkets(userId)

  if (!data) return <LoadingIndicator />

  return <ContractsGrid contracts={data} />
})
