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
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { useEffect, useState } from 'react'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { MINUTE_MS } from 'common/util/time'

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
        </Col>
      </Col>
    </Page>
  )
}
function FeedTimelineContent() {
  const user = useUser()
  const { boosts, feedTimelineItems, loadMoreOlder, loadMoreNewer } =
    useFeedTimeline(user, 'feed-timeline')
  const isVisible = useIsPageVisible()
  const [lastSeen, setLastSeen] = usePersistentLocalState(
    Date.now(),
    'last-seen-feed-timeline' + user?.id
  )
  const [scrolledDown, setScrolledDown] = useState(false)
  const [loadingNewer, setLoadingNewer] = useState(false)
  const checkForNewerFeedItems = () => {
    console.log(
      'TODO: a while has elapsed, check for new feed items and show floating button'
    )
  }
  useEffect(() => {
    const now = Date.now()
    if (isVisible && now - lastSeen > 5 * MINUTE_MS) checkForNewerFeedItems()
    if (!isVisible) setLastSeen(now)
    return () => setLastSeen(Date.now())
  }, [isVisible])

  if (!boosts || !feedTimelineItems) return <LoadingIndicator />

  return (
    <Col>
      <div className="relative">
        <VisibilityObserver
          className="pointer-events-none absolute top-0 h-5 w-full select-none "
          onVisibilityUpdated={(visible) => {
            if (visible && scrolledDown) {
              setLoadingNewer(true)
              loadMoreNewer().then(() => {
                setLoadingNewer(false)
                setScrolledDown(false)
              })
            }
            if (!visible) setScrolledDown(true)
          }}
        />
        {loadingNewer && <LoadingIndicator />}
      </div>
      <FeedTimelineItems
        boosts={boosts}
        user={user}
        feedTimelineItems={feedTimelineItems}
      />

      <div className="relative">
        <VisibilityObserver
          className="pointer-events-none absolute bottom-0 h-5 w-full select-none "
          onVisibilityUpdated={(visible) => visible && loadMoreOlder()}
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
