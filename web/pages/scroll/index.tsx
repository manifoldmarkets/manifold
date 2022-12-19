import { useEffect, useMemo, useState } from 'react'
import { uniqBy } from 'lodash'

import { buildArray } from 'common/util/array'
import type { BinaryContract, Contract } from 'common/contract'
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
import { useEvent } from 'web/hooks/use-event'
import { useWindowSize } from 'web/hooks/use-window-size'
import { SwipeCard } from 'web/components/contract/swipe-card'

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

  const [contractId, setContractId] = usePersistentState<string | undefined>(
    undefined,
    {
      key: 'swipe-index',
      store: inMemoryStore(),
    }
  )
  const [maxIndex, setMaxIndex] = usePersistentState(0, {
    key: 'swipe-max-index',
    store: inMemoryStore(),
  })

  const cards = useMemo(() => {
    return contracts.slice(0, (Math.ceil(maxIndex / 10) + 1) * 10)
  }, [contracts, maxIndex])

  useEffect(() => {
    if (contractId) {
      document.getElementById(contractId)?.scrollIntoView()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onView = useEvent((contract: Contract, alreadyViewed: boolean) => {
    const contractId = contract.id
    if (!alreadyViewed) {
      track('scroll view', { slug: contract.slug, contractId })
      if (user) logView({ contractId, userId: user.id })
    }
    const newIndex = contracts.findIndex((c) => c.id === contractId)
    if (newIndex !== -1) {
      setContractId(contractId)
      if (newIndex > maxIndex) setMaxIndex(newIndex)
    }
  })

  // Resize height manually to accommodate mobile web.
  const { height, width = 600 } = useWindowSize()

  if (user === undefined) {
    return <LoadingIndicator />
  }
  //show log in prompt if user not logged in
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
      <div
        className="absolute flex justify-center overflow-hidden overscroll-none pb-[58px]"
        style={{ height }}
      >
        <div className="scrollbar-hide relative w-full max-w-lg snap-y snap-mandatory overflow-y-scroll scroll-smooth">
          {cards.map((c) => (
            <SwipeCard
              key={c.id}
              contract={c}
              amount={amount}
              setAmount={setAmount}
              onView={onView}
              width={width}
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
        </div>
      </div>
    </Page>
  )
}
