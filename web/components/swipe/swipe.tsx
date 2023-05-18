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
  horizontalSwipeDist,
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
import { track } from 'web/lib/service/analytics'
import { placeBet } from 'web/lib/firebase/api'
import { formatMoney } from 'common/util/format'
import { useEvent } from 'web/hooks/use-event'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { ContractCardView } from 'common/events'

export function Swipe(props: { toggleView?: () => void }) {
  useTracking('view swipe page')
  useRedirectIfSignedOut()

  const { toggleView } = props

  const user = useUser()
  const { contracts, loadMore } = useFeed(user, 'swipe', { binaryOnly: true })
  const feed = contracts as BinaryContract[] | undefined

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
      track('view market card', {
        slug: contract.slug,
        creatorId: contract.creatorId,
        contractId: contract.id,
      } as ContractCardView)
      setAmount(STARTING_BET_AMOUNT)
    }
  }, [user, contract?.id])

  useEffect(() => {
    postMessageToNative('onPageVisit', { page: 'swipe' })
    return () => {
      postMessageToNative('onPageVisit', { page: undefined })
    }
  }, [])

  const cardHeight = height - BOTTOM_NAV_BAR_HEIGHT

  const [{ x, y }, api] = useSpring(() => ({
    x: 0,
    y: -index * cardHeight,
    config: { tension: 500, friction: 30, clamp: true },
  }))

  useEffect(() => {
    // In case of height resize, reset the y position.
    api.start({ y: -index * cardHeight })
  }, [api, cardHeight])

  const indexRef = useRef(index)
  indexRef.current = index

  const onBet = useEvent((outcome: 'YES' | 'NO') => {
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
      .catch(() => {
        setBetStatus(undefined)
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

    track('swipe bet', {
      slug: contract.slug,
      contractId,
      amount,
      outcome,
    })
  })

  const bind = useDrag(
    ({ down, movement: [mx, my] }) => {
      if (isModalOpen) return
      if (my > 0 && index === 0) return

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

      let y = -index * cardHeight + my
      if (!down) {
        let newIndex = index
        // Scroll to next or previous card.
        if (my <= -verticalSwipeDist) {
          newIndex = Math.min(cards.length - 1, index + 1)
          track('swipe', { direction: 'next' })
        } else if (my >= verticalSwipeDist) {
          newIndex = Math.max(0, index - 1)
          track('swipe', { direction: 'prev' })
        }

        y = -newIndex * cardHeight
        setTimeout(() => {
          // Hack to delay the re-rendering work until after animation is done.
          // Makes animation smooth for older devices, iOS.
          setIndex(newIndex)
        }, 200)
      }

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
            className="!absolute -z-10 select-none overflow-hidden"
            amount={amount}
            setAmount={setAmount}
            contract={cards[index + 1]}
            betDirection={betDirection}
            betStatus={betStatus}
            onBet={onBet}
            user={user}
            cardHeight={cardHeight}
            setIsModalOpen={setIsModalOpen}
            toggleView={toggleView}
          />
        )}

        <animated.div
          {...bind()}
          className="h-full w-full max-w-lg touch-none select-none"
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
              setIsModalOpen={setIsModalOpen}
              cardHeight={cardHeight}
              user={user}
              toggleView={toggleView}
            />
          ))}

          {contracts !== undefined && contracts.length === 0 && (
            <div className="m-4 flex w-full flex-col items-center justify-center">
              We're fresh out of cards!
              <SiteLink
                href="/markets?s=newest&f=open"
                className="text-primary-700"
              >
                Browse new markets
              </SiteLink>
            </div>
          )}
        </animated.div>
      </Row>
    </Page>
  )
}
