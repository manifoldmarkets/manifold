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
import { SwipeCard } from 'web/components/contract/swipe-card'
import { formatMoney } from 'common/util/format'
import { placeBet } from 'web/lib/firebase/api'
import { Row } from 'web/components/layout/row'
import { BOTTOM_NAV_BAR_HEIGHT } from 'web/components/nav/bottom-nav-bar'
import { postMessageToNative } from 'web/components/native-message-listener'
import { useTracking } from 'web/hooks/use-tracking'

const SWIPE_THRESHOLD = 100 // in px

export default function Swipe() {
  useTracking('view swipe page')

  const [amount, setAmount] = usePersistentState(10, {
    key: 'swipe-amount',
    store: inMemoryStore(),
  })

  const user = useUser()
  const { contracts, loadMore } = useFeed(user, 'swipe')
  const feed = contracts?.filter((c) => c.outcomeType === 'BINARY') as
    | BinaryContract[]
    | undefined

  const [index, setIndex] = usePersistentState(0, {
    key: 'swipe-index',
    store: inMemoryStore(),
  })

  useEffect(() => {
    if (feed && index + 2 >= feed.length) {
      loadMore()
    }
  }, [feed, index, loadMore])

  const contract = feed ? feed[index] : undefined

  const cards = useMemo(() => {
    if (!feed) return []
    return feed.slice(0, index + 2)
  }, [feed, index])

  const onBet = (outcome: 'YES' | 'NO') => {
    if (!feed) return
    const contract = feed[index]
    const contractId = contract.id

    const promise = placeBet({ amount, outcome, contractId })

    const shortQ = contract.question.slice(0, 20)
    const message = `Bet ${formatMoney(amount)} ${outcome} on "${shortQ}"...`

    toast.promise(
      promise,
      {
        loading: message,
        success: message,
        error: (err) => `Error placing bet: ${err.message}`,
      },
      { position: 'top-center' }
    )

    if (user) logView({ amount, outcome, contractId, userId: user.id })
    track('swipe bet', {
      slug: contract.slug,
      contractId,
      amount,
      outcome,
    })
  }

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
  const horizontalSwipeDist = 80

  const [{ x, y }, api] = useSpring(() => ({
    x: 0,
    y: -index * cardHeight,
    config: { tension: 1000, friction: 70 },
  }))

  useEffect(() => {
    if (user && contract) {
      logView({ contractId: contract.id, userId: user.id })
    }
  }, [user, contract])

  useEffect(() => {
    // In case of height resize, reset the y position.
    api.start({ y: -index * cardHeight })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, cardHeight])

  const [swipeDirection, setSwipeDirection] = useState<
    'YES' | 'NO' | undefined
  >(undefined)

  const bind = useDrag(
    ({ down, movement: [mx, my] }) => {
      const cappedDist = rubberbandIfOutOfBounds(
        Math.abs(mx),
        0,
        horizontalSwipeDist
      )
      let didBet = false
      if (!down && cappedDist >= horizontalSwipeDist) {
        // Horizontal swipe is triggered!
        const outcome = Math.sign(mx) > 0 ? 'YES' : 'NO'
        onBet(outcome)
        didBet = true
      }
      setSwipeDirection(
        !down || cappedDist < horizontalSwipeDist
          ? undefined
          : mx > 0
          ? 'YES'
          : 'NO'
      )
      const x = down ? Math.sign(mx) * cappedDist : 0

      let newIndex = index
      if (didBet) {
        // Scroll to next card.
        setTimeout(() => {
          newIndex = Math.min(cards.length - 1, index + 1)
          setIndex(newIndex)
          setAmount(10) // reset amount
          const y = -newIndex * cardHeight
          api.start({ y })
        }, 500)
      }
      if (!down) {
        // Scroll to next or previous card.
        if (my <= -SWIPE_THRESHOLD)
          newIndex = Math.min(cards.length - 1, index + 1)
        else if (my >= SWIPE_THRESHOLD) newIndex = Math.max(0, index - 1)

        setIndex(newIndex)
        if (newIndex !== index) setAmount(10)
      }
      const y = -newIndex * cardHeight + (down ? my : 0)

      api.start({ x, y })
    },
    { axis: 'lock' }
  )

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
      <Row
        className="absolute justify-center overflow-hidden overscroll-none"
        style={{ height: cardHeight }}
      >
        <div className="absolute inset-0 columns-2 gap-0 text-center text-2xl text-white">
          <div className="flex h-full items-center bg-teal-700">
            <div style={{ width: horizontalSwipeDist }}>YES</div>
          </div>
          <div className="bg-scarlet-700 flex h-full items-center justify-end">
            <div style={{ width: horizontalSwipeDist }}>NO</div>
          </div>
        </div>

        <animated.div
          {...bind()}
          className="w-full max-w-lg touch-none"
          style={{ x, y }}
        >
          {cards.map((c, i) => (
            <SwipeCard
              key={c.id}
              className={i < index - 1 ? 'invisible' : undefined}
              contract={c}
              amount={amount}
              setAmount={setAmount as any}
              swipeDirection={swipeDirection}
              user={user}
            />
          ))}

          {/* TODO: users should never run out of cards */}
          {!cards.length && (
            <div className="flex h-full w-full flex-col items-center justify-center">
              No more cards!
              <SiteLink href="/home" className="text-indigo-700">
                Return home
              </SiteLink>
            </div>
          )}
        </animated.div>
      </Row>
    </Page>
  )
}
