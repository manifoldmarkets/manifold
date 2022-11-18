import { getOutcomeProbabilityAfterBet } from 'common/calculate'
import type { BinaryContract, Contract } from 'common/contract'
import { formatMoney, formatPercent } from 'common/util/format'
import { richTextToString } from 'common/util/parse'
import { useMemo, useState } from 'react'
import TinderCard from 'react-tinder-card'
import { Avatar } from 'web/components/widgets/avatar'
import { Content } from 'web/components/widgets/editor'
import { useUser } from 'web/hooks/use-user'
import { useUserSwipes } from 'web/hooks/use-user-bets'
import { useWindowSize } from 'web/hooks/use-window-size'
import { placeBet } from 'web/lib/firebase/api'
import { logSwipe } from 'web/lib/firebase/views'
import { contractPath, getTrendingContracts } from 'web/lib/firebase/contracts'
import { track } from 'web/lib/service/analytics'
import { fromNow } from 'web/lib/util/time'
import { firebaseLogin } from 'web/lib/firebase/users'
import { Button } from 'web/components/buttons/button'
import { SiteLink } from 'web/components/widgets/site-link'
import { ExternalLinkIcon } from '@heroicons/react/outline'
import HorizontalArrows from 'web/lib/icons/horizontal-arrows'
import clsx from 'clsx'
import { getBinaryProb } from 'common/contract-details'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  MinusIcon,
  PlusIcon,
} from '@heroicons/react/solid'

export async function getStaticProps() {
  const contracts = (await getTrendingContracts(1000)).filter(
    (c) => c.outcomeType === 'BINARY' && (c.closeTime ?? Infinity) > Date.now()
  )
  return {
    props: { contracts },
    revalidate: 500,
  }
}

export default function Swipe(props: { contracts: BinaryContract[] }) {
  const { contracts } = props

  const old = useUserSwipes()
  const newToMe = useMemo(
    () => contracts.filter((c) => !old.includes(c.id)),
    [contracts, old]
  )

  const [index, setIndex] = useState(0)
  const cards = useMemo(
    () => newToMe.slice(index, index + 4).reverse(),
    [newToMe, index]
  )

  // resize height manually for iOS
  const { height, width = 600 } = useWindowSize()

  //show log in prompt if user not logged in
  const user = useUser()
  if (!user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Button onClick={firebaseLogin} color="gradient" size="2xl">
          Log in to use Manifold Swipe
        </Button>
      </div>
    )
  }

  return (
    <main
      className="h-screen overflow-hidden overscroll-none bg-gray-50 lg:py-6"
      style={{ height }}
    >
      <div className="relative mx-auto h-full max-w-lg">
        {cards.map((c) => (
          <Card
            contract={c}
            onLeave={() => setIndex((i) => i + 1)}
            threshold={Math.min(128, width * 0.15)}
            key={c.id}
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
    </main>
  )
}

type Direction = 'middle' | 'up' | 'right' | 'down' | 'left'

const betTapAdd = 10

const Card = (props: {
  contract: BinaryContract
  onLeave?: () => void
  threshold: number
}) => {
  const { contract, onLeave, threshold } = props
  const { question, description, coverImageUrl, id: contractId } = contract

  const userId = useUser()?.id

  const [amount, setAmount] = useState(10)
  const addMoney = () => setAmount?.((amount) => amount + betTapAdd)
  const subMoney = () => {
    if (amount <= betTapAdd) {
      setDir('up')
    } else {
      setAmount?.((amount) => amount - betTapAdd)
    }
  }

  const image =
    coverImageUrl ??
    `https://picsum.photos/id/${parseInt(contract.id, 36) % 1000}/512`

  const [dir, setDir] = useState<Direction>('middle')
  const [swiping, setSwiping] = useState(false)

  const [peek, setPeek] = useState(false)

  return (
    <>
      {peek && <Peek contract={contract} onClose={() => setPeek(false)} />}
      <TinderCard
        onSwipe={async (direction) => {
          if (direction === 'down') {
            setPeek(true)
            return
          }

          setSwiping(true)

          if (direction === 'left' || direction === 'right') {
            const outcome = direction === 'left' ? 'NO' : 'YES'
            await placeBet({ amount, outcome, contractId })
            userId && logSwipe({ amount, outcome, contractId, userId })
            track('swipe bet', {
              slug: contract.slug,
              contractId,
              amount,
              outcome,
            })
          }
          if (direction === 'up') {
            track('swipe skip', { slug: contract.slug, contractId })
            userId && logSwipe({ outcome: 'SKIP', contractId, userId })
          }
        }}
        onCardLeftScreen={onLeave}
        preventSwipe={['down']}
        swipeRequirementType="position"
        swipeThreshold={threshold}
        onSwipeRequirementFulfilled={setDir}
        onSwipeRequirementUnfulfilled={() => setDir('middle')}
        className={clsx(
          'absolute inset-2 cursor-grab [&>*]:last:scale-100',
          swiping && 'pointer-events-none'
        )}
      >
        <div className="h-full scale-95 overflow-hidden rounded-2xl transition-transform">
          {/* background */}
          <div className="flex h-full flex-col bg-black">
            <div className="relative mb-24 grow">
              <img src={image} alt="" className="h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent" />
            </div>
          </div>
          {/* content */}
          <div className="absolute inset-0 flex select-none flex-col gap-4">
            <CornerDetails contract={contract} />
            <div className="line-clamp-4 mx-8 mt-auto mb-4 text-2xl text-white [text-shadow:black_1px_1px_4px] ">
              {question}
            </div>
            <Percent
              contract={contract}
              amount={amount}
              outcome={
                dir === 'left' ? 'NO' : dir === 'right' ? 'YES' : undefined
              }
            />
            {/* TODO: use editor excluding widgets */}
            <div className="prose prose-invert prose-sm line-clamp-3 mx-8 text-gray-50">
              {typeof description === 'string'
                ? description
                : richTextToString(description)}
            </div>
            <div className="mb-4 flex flex-col items-center gap-2 self-center">
              <SwipeStatus direction={dir} />
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
        </div>
      </TinderCard>
    </>
  )
}

const SwipeStatus = (props: { direction: Direction }) => {
  const { direction } = props

  if (direction === 'up') {
    return (
      <div className="flex gap-1 text-indigo-100">
        Swipe <ArrowUpIcon className="h-5" /> to skip
      </div>
    )
  }
  if (direction === 'left') {
    return (
      <div className="text-scarlet-100 flex gap-1">
        <ArrowLeftIcon className="h-5" /> Bet NO
      </div>
    )
  }
  if (direction === 'right') {
    return (
      <div className="flex gap-1 text-teal-100">
        Bet YES <ArrowRightIcon className="h-5" />
      </div>
    )
  }
  return (
    <div className="flex gap-1 text-yellow-100">
      Swipe <HorizontalArrows /> to bet
    </div>
  )
}

const CornerDetails = (props: { contract: Contract }) => {
  const { contract } = props
  const { creatorName, creatorAvatarUrl, closeTime } = contract

  return (
    <div className="m-3 flex gap-2 drop-shadow">
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

const Peek = (props: { contract: BinaryContract; onClose: () => void }) => {
  const { contract, onClose } = props
  const { question, description } = contract
  return (
    <section className="absolute inset-0 z-50 flex flex-col bg-black/40">
      {/* spacer to close */}
      <button className="h-40 shrink-0" onClick={onClose} />
      <div className="h-6 shrink-0 rounded-t-3xl bg-white" />
      <div className="grow overflow-auto bg-white px-4">
        <h1 className="mb-8 text-lg font-semibold">{question}</h1>
        <Content size="sm" content={description} />
        <SiteLink
          href={contractPath(contract)}
          className="flex justify-center gap-2 text-indigo-700"
        >
          More details <ExternalLinkIcon className="my-px h-5 w-5" />
        </SiteLink>
      </div>
    </section>
  )
}
