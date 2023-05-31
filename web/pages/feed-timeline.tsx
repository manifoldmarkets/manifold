import { useUser } from 'web/hooks/use-user'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Title } from 'web/components/widgets/title'
import { DailyStats } from 'web/components/daily-stats'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import clsx from 'clsx'
import { track } from 'web/lib/service/analytics'
import Router from 'next/router'
import { PencilAltIcon } from '@heroicons/react/solid'
import { VisibilityObserver } from 'web/components/widgets/visibility-observer'
import { SiteLink } from 'web/components/widgets/site-link'
import { useFeedTimeline } from 'web/hooks/use-feed-timeline'
import { FeedTimelineItems } from 'web/components/feed/feed-timeline-items'

export default function FeedTimeline() {
  const user = useUser()

  return (
    <Page>
      <Col className="gap-2 py-2 pb-8 sm:px-2">
        <Row className="mx-4 mb-2 items-center gap-4">
          <Title children="Home" className="!my-0 hidden sm:block" />
          <DailyStats user={user} />
        </Row>

        <Col className={clsx('gap-6')}>
          <Col>
            <MainContent />
          </Col>
        </Col>
      </Col>
    </Page>
  )
}

const MainContent = () => {
  return (
    <Col>
      <FeedTimelineContent />
      <button
        type="button"
        className={clsx(
          'focus:ring-primary-500 fixed  right-3 z-20 inline-flex items-center rounded-full border  border-transparent  p-4 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 lg:hidden',
          'disabled:bg-ink-300 text-ink-0 from-primary-500 hover:from-primary-700 to-blue-500 hover:to-blue-700 enabled:bg-gradient-to-r',
          'bottom-[64px]'
        )}
        onClick={() => {
          Router.push('/create')
          track('mobile create button')
        }}
      >
        <PencilAltIcon className="h-6 w-6" aria-hidden="true" />
      </button>
    </Col>
  )
}
function FeedTimelineContent() {
  const user = useUser()
  const { boosts, feedTimelineItems, loadMore } = useFeedTimeline(user, 'feed')

  if (!boosts || !feedTimelineItems) return <LoadingIndicator />

  return (
    <Col>
      <FeedTimelineItems
        boosts={boosts}
        user={user}
        feedTimelineItems={feedTimelineItems}
      />

      <div className="relative">
        <VisibilityObserver
          className="pointer-events-none absolute bottom-0 h-screen w-full select-none"
          onVisibilityUpdated={(visible) => visible && loadMore()}
        />
      </div>

      {feedTimelineItems.length === 0 && (
        <div className="text-ink-1000 m-4 flex w-full flex-col items-center justify-center">
          We're fresh out of cards!
          <SiteLink
            href="/markets?s=newest&f=open"
            className="text-primary-700"
          >
            Browse new markets
          </SiteLink>
        </div>
      )}
    </Col>
  )
}
