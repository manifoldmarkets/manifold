import { SEO } from 'web/components/SEO'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { ActivityLog } from 'web/components/activity-log'
import { LovePage } from 'love/components/love-page'
import { ENV } from 'common/envs/constants'

export default function UpdatesPage() {
  return (
    <LovePage trackPageView={'live page'}>
      <SEO
        title="Live"
        description="Watch all site activity live, including bets, comments, and new questions."
        url="/live"
      />

      <Col className="w-full max-w-3xl gap-4 self-center sm:pb-4">
        <Row
          className={
            'w-full items-center justify-between pt-1 sm:justify-start sm:gap-4'
          }
        >
          <span className="text-primary-700 line-clamp-1 shrink px-1 text-2xl">
            Updates
          </span>
        </Row>
        <ActivityLog
          count={30}
          topicSlugs={['manifoldlove', 'manifoldlove-relationships']}
          blockedUserIds={[manifoldLoveUserId]}
          hideQuestions
        />
      </Col>
    </LovePage>
  )
}

const manifoldLoveUserId =
  ENV === 'PROD'
    ? 'tRZZ6ihugZQLXPf6aPRneGpWLmz1'
    : 'RlXR2xa4EFfAzdCbSe45wkcdarh1'
