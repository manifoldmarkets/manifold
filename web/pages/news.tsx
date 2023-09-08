import { ReactNode, useState } from 'react'
import { SEO } from 'web/components/SEO'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { NewsTopicsTabs } from 'web/components/news/news-topics-tabs'
import { Title } from 'web/components/widgets/title'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'
import { useSaveReferral } from 'web/hooks/use-save-referral'

export default function NewsPage() {
  useSaveReferral()
  useSaveCampaign()

  const [sidebar, setSidebar] = useState<ReactNode>(<></>)

  return (
    <Page trackPageView={'news page'} rightSidebar={sidebar}>
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
