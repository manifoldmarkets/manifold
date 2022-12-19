import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { useTracking } from 'web/hooks/use-tracking'
import { useUser } from 'web/hooks/use-user'
import { DailyProfit } from '../components/daily-stats'
import { YourFeed } from './home'

export default function YourFeedPage() {
  const user = useUser()
  useTracking('view your feed')

  return (
    <Page>
      <Col className="pm:mx-10 gap-4 sm:px-4 sm:pb-4">
        <Row className="mt-4 items-start justify-between sm:mt-0">
          <Title className="mx-4 !mb-0 !mt-0 sm:mx-0" text="Your feed" />
          <DailyProfit user={user} />
        </Row>
        {user && <YourFeed user={user} count={500} />}
      </Col>
    </Page>
  )
}
