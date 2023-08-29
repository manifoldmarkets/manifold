import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Title } from 'web/components/widgets/title'
import { useTracking } from 'web/hooks/use-tracking'
import { SEO } from 'web/components/SEO'
import { NewsTopicsTabs } from 'web/components/news/news-topics-tabs'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'
import { buildArray } from 'common/util/array'
import { Tab } from 'web/components/layout/tabs'
import { newsContent } from 'web/components/news/news-content'
import { useState, ReactNode } from 'react'

export default function NewsPage() {
  useTracking('view news page')
  useSaveReferral()
  useSaveCampaign()

  const topics = buildArray<Tab>(...newsContent)
  const [sidebar, setSidebar] = useState<ReactNode>(<></>)

  return (
    <Page rightSidebar={sidebar}>
      <SEO
        title="News"
        description="Breaking news meets the wisdom of the crowd"
      />
      <Col className="mx-auto w-full gap-6 pb-8 sm:px-2 lg:pr-4">
        <Row className="mx-4 mt-2 items-center justify-between gap-4">
          <Title className="!mb-0">News</Title>
        </Row>

        <NewsTopicsTabs setSidebar={setSidebar} />
      </Col>
    </Page>
  )
}
