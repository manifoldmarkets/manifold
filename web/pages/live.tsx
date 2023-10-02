import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import {
  ActivityLog,
  LivePillOptions,
  PillOptions,
} from 'web/components/activity-log'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { SEO } from 'web/components/SEO'

export default function LivePage() {
  const [pill, setPill] = usePersistentInMemoryState<PillOptions>(
    'all',
    'live-pill'
  )

  return (
    <Page trackPageView={'live page'}>
      <SEO
        title="Live"
        description="Watch all site activity live, including bets, comments, and new questions."
        url="/live"
      />

      <Col className="w-full max-w-3xl gap-4 self-center sm:pb-4">
        <Title className="!mb-0">Live feed</Title>
        <Col className="gap-4">
          <LivePillOptions pill={pill} setPill={setPill} />
          <ActivityLog count={30} pill={pill} />
        </Col>
      </Col>
    </Page>
  )
}
