import { useEffect, useMemo, useRef, useState } from 'react'
import { animated, useSpring } from '@react-spring/web'
import { rubberbandIfOutOfBounds, useDrag } from '@use-gesture/react'
import toast from 'react-hot-toast'

import type { BinaryContract } from 'common/contract'
import { Button } from 'web/components/buttons/button'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { postMessageToNative } from 'web/components/native-message-listener'
import { BOTTOM_NAV_BAR_HEIGHT } from 'web/components/nav/bottom-nav-bar'
import { SwipeCard } from 'web/components/swipe/swipe-card'
import {
  STARTING_BET_AMOUNT,
  verticalSwipeDist,
} from 'web/components/swipe/swipe-helpers'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { SiteLink } from 'web/components/widgets/site-link'
import { useFeed } from 'web/hooks/use-feed'
import {
  inMemoryStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { useTracking } from 'web/hooks/use-tracking'
import { useUser } from 'web/hooks/use-user'
import { useWindowSize } from 'web/hooks/use-window-size'
import { firebaseLogin } from 'web/lib/firebase/users'
import { logView } from 'web/lib/firebase/views'
import { track } from 'web/lib/service/analytics'
import { placeBet } from 'web/lib/firebase/api'
import { formatMoney } from 'common/util/format'

export default function Swipe() {
  useTracking('view swipe page')

  const user = useUser()
  const { contracts, loadMore } = useFeed(user, 'swipe')
  const feed = contracts?.filter((c) => c.outcomeType === 'BINARY') as
    | BinaryContract[]
    | undefined

  const [index, setIndex] = usePersistentState(0, {
    key: 'swipe-index',
    store: inMemoryStore(),
  })
  const [amount, setAmount] = useState(STARTING_BET_AMOUNT)
  const [betDirection, setBetDirection] = useState<'YES' | 'NO' | undefined>()
  const [betStatus, setBetStatus] = useState<
    'loading' | 'success' | string | undefined
  >(undefined)
  const [isModalOpen, setIsModalOpen] = useState(false)

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

  useEffect(() => {
    if (user && contract) {
      logView({ contractId: contract.id, userId: user.id })
      setAmount(STARTING_BET_AMOUNT)
    }
  }, [user, contract])

  useEffect(() => {
    postMessageToNative('onPageVisit', { page: 'swipe' })
    return () => {
      postMessageToNative('onPageVisit', { page: undefined })
    }
  }, [])

  const cardHeight = height - BOTTOM_NAV_BAR_HEIGHT
  const horizontalSwipeDist = 40

  const [{ x, y }, api] = useSpring(() => ({
    x: 0,
    y: -index * cardHeight,
    config: { tension: 1000, friction: 70 }, // clamp: true?
  }))

  useEffect(() => {
    // In case of height resize, reset the y position.
    api.start({ y: -index * cardHeight })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, cardHeight])

  const indexRef = useRef(index)
  indexRef.current = index

  const onBet = (outcome: 'YES' | 'NO') => {
    if (!contract) return

    setBetStatus('loading')

    const contractId = contract.id
    const promise = placeBet({ amount, outcome, contractId })
    promise
      .then(() => {
        setBetStatus('success')

        setTimeout(() => {
          // Check if user has swiped to a different card.
          if (indexRef.current !== index) return

          // Scroll to next card.
          const newIndex = Math.min(cards.length - 1, index + 1)
          setIndex(newIndex)
          const y = -newIndex * cardHeight
          api.start({ y })
        }, 500)
      })
      .catch((e) => {
        setBetStatus(e.message)
        setBetDirection(undefined)

        // Scroll back to neutral position.
        api.start({ x: 0 })
      })

    const shortQ = contract.question.slice(0, 18)
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

  const bind = useDrag(
    ({ down, movement: [mx, my] }) => {
      if (isModalOpen) return

      const xCappedDist = rubberbandIfOutOfBounds(
        Math.abs(mx),
        0,
        horizontalSwipeDist
      )
      if (!down && xCappedDist >= horizontalSwipeDist) {
        // Horizontal swipe is triggered!
        const outcome = Math.sign(mx) > 0 ? 'YES' : 'NO'
        onBet(outcome)
      }
      setBetDirection(
        !down || xCappedDist < horizontalSwipeDist
          ? undefined
          : mx > 0
          ? 'YES'
          : 'NO'
      )
      const x = down ? Math.sign(mx) * xCappedDist : 0

      let newIndex = index
      if (!down) {
        // Scroll to next or previous card.
        if (my <= -verticalSwipeDist)
          newIndex = Math.min(cards.length - 1, index + 1)
        else if (my >= verticalSwipeDist) newIndex = Math.max(0, index - 1)
        setIndex(newIndex)
      }
      const y = -newIndex * cardHeight + (down ? my : 0)

      api.start({ x, y })
    },
    { axis: 'lock' }
  )

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
        {index + 1 < cards.length && (
          <SwipeCard
            className="select-none overflow-hidden"
            style={{ position: 'absolute' }}
            amount={amount}
            setAmount={setAmount}
            contract={cards[index + 1]}
            betDirection={betDirection}
            betStatus={betStatus}
            onBet={onBet}
            user={user}
            isModalOpen={false}
            setIsModalOpen={setIsModalOpen}
          />
        )}

        <animated.div
          {...bind()}
          className="w-full max-w-lg touch-none select-none"
          style={{ x, y }}
        >
          {cards.map((c, i) => (
            <SwipeCard
              key={c.id}
              className={i < index - 1 ? 'invisible' : undefined}
              amount={amount}
              setAmount={setAmount}
              contract={c}
              betDirection={betDirection}
              betStatus={betStatus}
              onBet={onBet}
              isModalOpen={isModalOpen && i === index}
              setIsModalOpen={setIsModalOpen}
              user={user}
            />
          ))}

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
