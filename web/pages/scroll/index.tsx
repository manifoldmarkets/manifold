import { useEffect, useMemo, useState } from 'react'
import { uniqBy } from 'lodash'
import { useSpring, animated } from '@react-spring/web'
import { rubberbandIfOutOfBounds, useDrag } from '@use-gesture/react'
import toast from 'react-hot-toast'

import { buildArray } from 'common/util/array'
import type { BinaryContract } from 'common/contract'
import { useUser } from 'web/hooks/use-user'
import { logView } from 'web/lib/firebase/views'
import { getTrendingContracts } from 'web/lib/firebase/contracts'
import { track } from 'web/lib/service/analytics'
import { firebaseLogin } from 'web/lib/firebase/users'
import { Button } from 'web/components/buttons/button'
import { SiteLink } from 'web/components/widgets/site-link'
import { Page } from 'web/components/layout/page'
import { useSwipes } from 'web/hooks/use-swipes'
import { useFeed } from 'web/hooks/use-feed'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import {
  inMemoryStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { useWindowSize } from 'web/hooks/use-window-size'
import { SwipeCard } from 'web/components/contract/swipe-card'
import { Col } from 'web/components/layout/col'
import { formatMoney } from 'common/util/format'
import { placeBet } from 'web/lib/firebase/api'
import { Row } from 'web/components/layout/row'

export async function getStaticProps() {
  const contracts = (await getTrendingContracts(200)).filter(
    (c) => c.outcomeType === 'BINARY' && (c.closeTime ?? Infinity) > Date.now()
  )
  return {
    props: { contracts },
    revalidate: 500,
  }
}

export default function Scroll(props: { contracts: BinaryContract[] }) {
  const [amount, setAmount] = useState(10)

  const old = useSwipes()
  const newToMe = useMemo(
    () => props.contracts.filter((c) => !old.includes(c.id)),
    [props.contracts, old]
  )

  const user = useUser()
  const feed = useFeed(user, 400)?.filter((c) => c.outcomeType === 'BINARY') as
    | BinaryContract[]
    | undefined

  const contracts = uniqBy(
    buildArray(newToMe[0], feed, newToMe.slice(1)),
    (c) => c.id
  )
  const [index, setIndex] = usePersistentState(0, {
    key: 'swipe-index',
    store: inMemoryStore(),
  })
  const contract = contracts[index]

  const cards = useMemo(() => {
    return contracts.slice(0, index + 2)
  }, [contracts, index])

  const onBet = (outcome: 'YES' | 'NO') => {
    const contract = contracts[index]
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
    track('scroll bet', {
      slug: contract.slug,
      contractId,
      amount,
      outcome,
    })
  }

  // Measure height manually to accommodate mobile web.
  const { height: computedHeight, width = 600 } = useWindowSize()
  const [height, setHeight] = usePersistentState(computedHeight ?? 800, {
    key: 'screen-height',
    store: inMemoryStore(),
  })
  useEffect(() => {
    if (computedHeight !== undefined) {
      setHeight(computedHeight)
    }
  }, [computedHeight, setHeight])

  // Subtract bottom bar height.
  const cardHeight = height - 58
  const horizontalSwipeDist = width * 0.2

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

  const bind = useDrag(
    ({ down, movement: [mx, my] }) => {
      const cappedDist = rubberbandIfOutOfBounds(
        Math.abs(mx),
        0,
        horizontalSwipeDist
      )
      if (!down && cappedDist >= horizontalSwipeDist) {
        const outcome = Math.sign(mx) > 0 ? 'YES' : 'NO'
        onBet(outcome)
      }
      const x = down ? Math.sign(mx) * cappedDist : 0

      let newIndex = index
      if (!down) {
        if (my < 0) newIndex = Math.min(cards.length - 1, index + 1)
        else if (my > 0) newIndex = Math.max(0, index - 1)
        setIndex(newIndex)
      }
      const y = -newIndex * cardHeight + (down ? my : 0)

      api.start({ x, y })
    },
    { axis: 'lock' }
  )

  if (user === undefined) {
    return <LoadingIndicator />
  }
  // Show log in prompt if user not logged in.
  if (user === null) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Button onClick={firebaseLogin} color="gradient" size="2xl">
          Log in to use Manifold Swipe
        </Button>
      </div>
    )
  }

  return (
    <Page>
      <Row
        className="absolute justify-center overflow-hidden overscroll-none"
        style={{ height: cardHeight }}
      >
        <Col
          className="absolute h-full bg-teal-700"
          style={{ width: width / 2, left: 0 }}
        >
          <Col
            className="h-full items-center justify-center text-2xl text-white"
            style={{ width: horizontalSwipeDist }}
          >
            YES
          </Col>
        </Col>
        <Col
          className="bg-scarlet-700 absolute h-full items-end"
          style={{ width: width / 2, right: 0 }}
        >
          <Col
            className="h-full items-center justify-center text-2xl text-white"
            style={{ width: horizontalSwipeDist }}
          >
            NO
          </Col>
        </Col>

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
              setAmount={setAmount}
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
