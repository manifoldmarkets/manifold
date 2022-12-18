import toast from 'react-hot-toast'
import clsx from 'clsx'
import { memo, useEffect, useMemo, useState } from 'react'
import { MinusIcon, PlusIcon } from '@heroicons/react/solid'
import { uniqBy } from 'lodash'

import { buildArray } from 'common/util/array'
import { getOutcomeProbabilityAfterBet } from 'common/calculate'
import type { BinaryContract, Contract } from 'common/contract'
import { formatMoney, formatPercent } from 'common/util/format'
import { richTextToString } from 'common/util/parse'
import { Avatar } from 'web/components/widgets/avatar'
import { useUser } from 'web/hooks/use-user'
import { placeBet } from 'web/lib/firebase/api'
import { logView } from 'web/lib/firebase/views'
import { contractPath, getTrendingContracts } from 'web/lib/firebase/contracts'
import { track } from 'web/lib/service/analytics'
import { fromNow } from 'web/lib/util/time'
import { firebaseLogin } from 'web/lib/firebase/users'
import { Button } from 'web/components/buttons/button'
import { SiteLink } from 'web/components/widgets/site-link'
import { getBinaryProb } from 'common/contract-details'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { useSwipes } from 'web/hooks/use-swipes'
import { useFeed } from 'web/hooks/use-feed'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import {
  inMemoryStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { Col } from 'web/components/layout/col'
import { VisibilityObserver } from 'web/components/widgets/visibility-observer'
import { useEvent } from 'web/hooks/use-event'

export async function getStaticProps() {
  const contracts = (await getTrendingContracts(200)).filter(
    (c) => c.outcomeType === 'BINARY' && (c.closeTime ?? Infinity) > Date.now()
  )
  return {
    props: { contracts },
    revalidate: 500,
  }
}

export default function Swipe(props: { contracts: BinaryContract[] }) {
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
      track('swipe', { slug: contract.slug, contractId })
      if (user) logView({ contractId, userId: user.id })
    }
    const newIndex = contracts.findIndex((c) => c.id === contractId)
    if (newIndex !== -1) {
      setContractId(contractId)
      if (newIndex > maxIndex) setMaxIndex(newIndex)
    }
  })

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
      <div className="absolute flex h-screen justify-center overflow-hidden overscroll-none pb-[58px]">
        <div className="scrollbar-hide relative w-full max-w-lg snap-y snap-mandatory overflow-y-scroll scroll-smooth">
          {cards.map((c) => (
            <Card
              key={c.id}
              contract={c}
              amount={amount}
              setAmount={setAmount}
              onView={onView}
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

const betTapAdd = 10

const Card = memo(
  (props: {
    contract: BinaryContract
    amount: number
    setAmount: (amount: number) => void
    onView: (contract: BinaryContract, alreadyViewed: boolean) => void
  }) => {
    const { contract, amount, setAmount, onView } = props
    const { question, description, coverImageUrl, id: contractId } = contract

    const [isViewed, setIsViewed] = usePersistentState(false, {
      key: contract.id + '-viewed',
      store: inMemoryStore(),
    })

    const userId = useUser()?.id

    const addMoney = () => setAmount(amount + betTapAdd)

    const subMoney = () => {
      if (amount <= betTapAdd) {
      } else {
        setAmount(amount - betTapAdd)
      }
    }

    const image =
      coverImageUrl ??
      `https://picsum.photos/id/${parseInt(contract.id, 36) % 1000}/512`

    const onClickBet = (outcome: 'YES' | 'NO') => {
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

      userId && logView({ amount, outcome, contractId, userId })
      track('swipe bet', {
        slug: contract.slug,
        contractId,
        amount,
        outcome,
      })
    }

    return (
      <Col
        className={clsx('relative h-full snap-start snap-always')}
        id={contract.id}
      >
        {/* background */}
        <div className="flex h-full flex-col bg-black">
          <div className="relative mb-24 grow">
            <img
              src={image}
              alt=""
              className="h-full object-cover"
              style={{ filter: 'brightness(0.60)' }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent" />
          </div>
        </div>

        {/* content */}
        <div className="absolute inset-0 flex select-none flex-col gap-4">
          <CornerDetails contract={contract} />
          <SiteLink
            className="line-clamp-6 mx-8 mt-auto mb-4 text-2xl text-white drop-shadow-2xl"
            href={contractPath(contract)}
            followsLinkClass
          >
            {question}
          </SiteLink>
          <Percent contract={contract} amount={amount} outcome={undefined} />
          {/* TODO: use editor excluding widgets */}
          <div className="prose prose-invert prose-sm line-clamp-3 mx-8 mb-2 text-gray-50">
            {typeof description === 'string'
              ? description
              : richTextToString(description)}
          </div>

          <Row className="gap-4 px-8">
            <button
              className={clsx(
                'hover:bg-teal-600-focus hover:border-teal-600-focus inline-flex flex-1 items-center justify-center rounded-lg border-2 border-teal-600 p-2 hover:text-white',
                'bg-transparent text-lg text-teal-500 active:bg-teal-600'
              )}
              onClick={() => onClickBet('YES')}
            >
              Bet YES
            </button>
            <button
              className={clsx(
                'hover:bg-teal-600-focus hover:border-teal-600-focus border-scarlet-300 inline-flex flex-1 items-center justify-center rounded-lg border-2 p-2 hover:text-white',
                'text-scarlet-300 active:bg-scarlet-400 bg-transparent text-lg'
              )}
              onClick={() => onClickBet('NO')}
            >
              Bet NO
            </button>
          </Row>

          <div className="mb-4 flex flex-col items-center gap-2 self-center">
            <span className="flex overflow-hidden rounded-full border  border-yellow-400 text-yellow-300">
              <button
                onClick={subMoney}
                onTouchStart={subMoney}
                className="pl-5 pr-4 transition-colors focus:bg-yellow-200/20 active:bg-yellow-400 active:text-white"
              >
                <MinusIcon className="h-4" />
              </button>
              <span className="mx-1 py-4">{formatMoney(amount)}</span>
              <button
                onClick={addMoney}
                onTouchStart={addMoney}
                className="pl-4 pr-5 transition-colors focus:bg-yellow-200/20 active:bg-yellow-400 active:text-white"
              >
                <PlusIcon className="h-4" />
              </button>
            </span>
          </div>
        </div>

        <VisibilityObserver
          className="relative"
          onVisibilityUpdated={(visible) => {
            if (visible) {
              onView(contract, isViewed)
              setIsViewed(true)
            }
          }}
        />
      </Col>
    )
  }
)

const CornerDetails = (props: { contract: Contract }) => {
  const { contract } = props
  const { creatorName, creatorAvatarUrl, closeTime } = contract

  return (
    <div className="m-3 flex gap-2 self-start drop-shadow">
      <Avatar size="sm" avatarUrl={creatorAvatarUrl} noLink />
      <div className="text-xs">
        <div className="text-white">{creatorName} </div>
        {closeTime != undefined && (
          <div className="text-gray-50 ">
            trading closes {fromNow(closeTime)}
          </div>
        )}
      </div>
    </div>
  )
}

function Percent(props: {
  contract: BinaryContract
  amount: number
  outcome?: 'NO' | 'YES'
}) {
  const { contract, amount, outcome } = props
  const percent =
    outcome === 'NO'
      ? 1 - getOutcomeProbabilityAfterBet(contract, 'NO', amount)
      : outcome === 'YES'
      ? getOutcomeProbabilityAfterBet(contract, 'YES', amount)
      : getBinaryProb(contract)

  return (
    <div
      className={clsx(
        'transition-color flex items-center self-center font-bold',
        !outcome && 'text-white',
        outcome === 'YES' && 'text-teal-100',
        outcome === 'NO' && 'text-scarlet-100'
      )}
    >
      <span
        className={clsx(
          'text-8xl transition-all',
          !outcome && '[text-shadow:#4337c9_0_8px]',
          outcome === 'YES' &&
            '[text-shadow:#14b8a6_-6px_4px,#0f766e_-12px_8px]',
          outcome === 'NO' && '[text-shadow:#FF2400_6px_4px,#991600_12px_8px]'
        )}
      >
        {formatPercent(percent).slice(0, -1)}
      </span>
      <span className="pt-2 text-2xl">%</span>
    </div>
  )
}
