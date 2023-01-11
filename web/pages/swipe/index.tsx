import { useEffect, useMemo, useState } from 'react'
import { useSpring, animated } from '@react-spring/web'
import { rubberbandIfOutOfBounds, useDrag } from '@use-gesture/react'
import toast from 'react-hot-toast'

import type { BinaryContract } from 'common/contract'
import { useUser } from 'web/hooks/use-user'
import { logView } from 'web/lib/firebase/views'
import { track } from 'web/lib/service/analytics'
import { firebaseLogin } from 'web/lib/firebase/users'
import { Button } from 'web/components/buttons/button'
import { SiteLink } from 'web/components/widgets/site-link'
import { Page } from 'web/components/layout/page'
import { useFeed } from 'web/hooks/use-feed'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import {
  inMemoryStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { useWindowSize } from 'web/hooks/use-window-size'
import { PrimarySwipeCard, SwipeCard } from 'web/components/swipe/swipe-card'
import { formatMoney } from 'common/util/format'
import { placeBet } from 'web/lib/firebase/api'
import { Row } from 'web/components/layout/row'
import { BOTTOM_NAV_BAR_HEIGHT } from 'web/components/nav/bottom-nav-bar'
import { postMessageToNative } from 'web/components/native-message-listener'
import { useTracking } from 'web/hooks/use-tracking'
import clsx from 'clsx'

export default function Swipe() {
  useTracking('view swipe page')

  const user = useUser()
  const feed = useFeed(user, 400)?.filter((c) => c.outcomeType === 'BINARY') as
    | BinaryContract[]
    | undefined

  const [index, setIndex] = usePersistentState(0, {
    key: 'swipe-index',
    store: inMemoryStore(),
  })
  const contract = feed ? feed[index] : undefined

  const cards = useMemo(() => {
    if (!feed) return []
    return feed.slice(index, index + 2)
  }, [feed, index])

  const [amount, setAmount] = useState(10)

  // Measure height manually to accommodate mobile web.
  const { height: computedHeight } = useWindowSize()
  const [height, setHeight] = usePersistentState(computedHeight ?? 800, {
    key: 'screen-height',
    store: inMemoryStore(),
  })
  useEffect(() => {
    if (computedHeight !== undefined) {
      setHeight(computedHeight)
    }
  }, [computedHeight, setHeight])

  const cardHeight = height - BOTTOM_NAV_BAR_HEIGHT

  useEffect(() => {
    if (user && contract) {
      logView({ contractId: contract.id, userId: user.id })
    }
  }, [user, contract])

  useEffect(() => {
    postMessageToNative('onPageVisit', { page: 'swipe' })
    return () => {
      postMessageToNative('onPageVisit', { page: undefined })
    }
  }, [])

  if (user === undefined || feed === undefined) {
    return (
      <Page>
        <LoadingIndicator className="mt-6" />
      </Page>
    )
  }
  // Show log in prompt if user not logged in.
  if (user === null) {
    return (
      <Page>
        <div className="flex h-screen w-screen items-center justify-center">
          <Button onClick={firebaseLogin} color="gradient" size="2xl">
            Log in to use Manifold Swipe
          </Button>
        </div>
      </Page>
    )
  }

  return (
    <Page>
      <Row className={clsx('relative w-screen')} style={{ height: cardHeight }}>
        {cards.length > 0 && (
          <PrimarySwipeCard
            key={
              cards[0].description +
              cards[0].question +
              cards[0].creatorUsername
            }
            contract={cards[0]}
            index={index}
            setIndex={setIndex}
            cardHeight={cardHeight}
            user={user}
          />
        )}
        {cards.length > 1 && (
          <SwipeCard
            contract={cards[1]}
            key={
              cards[1].description +
              cards[1].question +
              cards[1].creatorUsername
            }
            index={index}
            amount={amount}
            setAmount={setAmount}
            setIndex={setIndex}
            cardHeight={cardHeight}
            user={user}
            isPrimaryCard={false}
            className="user-select-none absolute inset-1 z-10 max-w-lg touch-none"
          />
        )}
        {!cards.length && (
          <div className="flex h-full w-full flex-col items-center justify-center">
            No more cards!
            <SiteLink href="/home" className="text-indigo-700">
              Return home
            </SiteLink>
          </div>
        )}
      </Row>
    </Page>
  )
}
