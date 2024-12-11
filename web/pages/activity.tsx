import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { Row } from 'web/components/layout/row'
import { SiteActivity } from 'web/components/site-activity'
import { TRADE_TERM } from 'common/envs/constants'

export default function ActivityPage() {
  return (
    <Page trackPageView={'activity page'}>
      <SEO
        title="Activity"
        description={`Watch all site activity live, including ${TRADE_TERM}s, comments, and new questions.`}
        url="/activity"
      />

      <Col className="w-full max-w-3xl gap-4 self-center sm:pb-4">
        <Row
          className={
            'w-full items-center justify-between pt-1 sm:justify-start sm:gap-4'
          }
        >
          <span className="text-primary-700 line-clamp-1 shrink px-1 text-2xl">
            Activity
          </span>
        </Row>
        <SiteActivity className="w-full" />
      </Col>
    </Page>
  )
}
