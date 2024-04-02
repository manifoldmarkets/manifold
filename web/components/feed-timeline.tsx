import { useIsAuthorized } from 'web/hooks/use-user'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import clsx from 'clsx'
import { ArrowUpIcon } from '@heroicons/react/solid'
import { VisibilityObserver } from 'web/components/widgets/visibility-observer'
import Link from 'next/link'
import { FeedTimelineItem, useFeedTimeline } from 'web/hooks/use-feed-timeline'
import { FeedTimelineItems } from 'web/components/feed/feed-timeline-items'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { useEffect, useState } from 'react'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { Avatar } from 'web/components/widgets/avatar'
import { range, uniq, uniqBy } from 'lodash'
import { filterDefined } from 'common/util/array'
import { MINUTE_MS } from 'common/util/time'
import { PrivateUser, User } from 'common/user'

export function FeedTimeline(props: {
  privateUser: PrivateUser
  user: User | undefined | null
  className?: string
}) {
  const { privateUser, user, className } = props
  const {
    boosts,
    checkForNewer,
    addTimelineItems,
    savedFeedItems,
    loadMoreOlder,
  } = useFeedTimeline(user, privateUser, `feed-timeline-${user?.id}`)
  const pageVisible = useIsPageVisible()
  const [lastSeen, setLastSeen] = usePersistentLocalState(
    Date.now(),
    'last-seen-feed-timeline' + user?.id
  )
  const isAuthed = useIsAuthorized()
  const [topIsVisible, setTopIsVisible] = useState(false)
  const [newerTimelineItems, setNewerTimelineItems] = useState<
    FeedTimelineItem[]
  >([])
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    if (!isAuthed || newerTimelineItems.length > 0) return
    const now = Date.now()
    // This queries for new items if they scroll to the top
    if (topIsVisible && now - lastSeen > 10000) {
      setLoadingMore(true)
      checkForNewer().then((newerTimelineItems) => {
        addTimelineItems(newerTimelineItems, { time: 'new' })
        setLoadingMore(false)
      })
    }
    // This queries for new items if they haven't looked at the page in a while like twitter
    else if (pageVisible && now - lastSeen > MINUTE_MS && !loadingMore) {
      checkForNewer().then((newerTimelineItems) => {
        const savedIds = savedFeedItems?.map((i) => i.id) ?? []
        setNewerTimelineItems(
          newerTimelineItems.filter((i) => !savedIds.includes(i.id))
        )
      })
    }
    setLastSeen(now)
    return () => setLastSeen(Date.now())
  }, [pageVisible, topIsVisible, isAuthed])

  if (!savedFeedItems) return <LoadingIndicator className={className} />
  const newAvatarUrls = uniq(
    filterDefined(newerTimelineItems.map((item) => item.avatarUrl))
  ).slice(0, 3)
  const fetchMoreOlderContent = async () => {
    if (!user) return
    const maxTries = 4
    for (const i of range(0, maxTries)) {
      let moreFeedItems = []
      if (i < maxTries / 2) moreFeedItems = await loadMoreOlder(false)
      else if (i >= maxTries / 2) {
        moreFeedItems = await loadMoreOlder(true)
      }
      if (moreFeedItems.length > 5) break
    }
  }

  return (
    <Col className={clsx('relative w-full gap-4', className)}>
      <VisibilityObserver
        className="pointer-events-none absolute top-0 h-5 w-full select-none "
        onVisibilityUpdated={(visible) => {
          if (visible && !topIsVisible) {
            addTimelineItems(newerTimelineItems, { time: 'new' })
            setNewerTimelineItems([])
            setTopIsVisible(true)
          }
          if (!visible) setTopIsVisible(false)
        }}
      />
      {newAvatarUrls.length > 2 && !topIsVisible && (
        <NewActivityButton
          avatarUrls={newAvatarUrls}
          onClick={() => setLastSeen(Date.now)}
        />
      )}

      {loadingMore && (
        <Row className={'my-1 mb-2 justify-center'}>
          <LoadingIndicator />
        </Row>
      )}
      <FeedTimelineItems
        boosts={boosts}
        user={user}
        feedTimelineItems={uniqBy(savedFeedItems, (i) => i.id)}
      />
      <div className="relative">
        <VisibilityObserver
          className="pointer-events-none absolute bottom-0 h-screen w-full select-none"
          onVisibilityUpdated={(visible) =>
            visible && isAuthed && fetchMoreOlderContent()
          }
        />
      </div>

      {savedFeedItems.length === 0 && (
        <div className="text-ink-1000 m-4 flex w-full flex-col items-center justify-center">
          <div>Congratulations!</div>
          <div>You've reached the end of the feed.</div>
          <div>You are free.</div>
          <br />
          <Link
            href="/browse?s=newest&f=open"
            className="text-primary-700 hover:underline"
          >
            Browse new questions
          </Link>
          <Link href="/create" className="text-primary-700 hover:underline">
            Create a question
          </Link>
        </div>
      )}
    </Col>
  )
}

const NewActivityButton = (props: {
  avatarUrls: string[]
  onClick: () => void
}) => {
  const { avatarUrls, onClick } = props
  const scrollToTop = () => {
    onClick()
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  return (
    <button
      className={clsx(
        'bg-canvas-50 border-ink-200 hover:bg-ink-200 rounded-full border-2 py-2 pl-2 pr-3 text-sm transition-colors',
        'sticky top-7 z-20 self-center'
      )}
      onClick={scrollToTop}
    >
      <Row className="text-ink-600 items-center ">
        <ArrowUpIcon className="text-ink-400 mr-3 h-5 w-5" />
        {avatarUrls.map((url) => (
          <Avatar
            key={url + 'new-feed-activity-button'}
            size={'xs'}
            className={'-ml-2'}
            avatarUrl={url}
          />
        ))}
        <div className="ml-1">New updates</div>
      </Row>
    </button>
  )
}
