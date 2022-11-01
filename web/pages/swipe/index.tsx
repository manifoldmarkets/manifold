import { getOutcomeProbabilityAfterBet } from 'common/calculate'
import type { BinaryContract, Contract } from 'common/contract'
import { formatMoney, formatPercent } from 'common/util/format'
import { richTextToString } from 'common/util/parse'
import { useMemo, useState } from 'react'
import TinderCard from 'react-tinder-card'
import { Avatar } from 'web/components/widgets/avatar'
import { Content } from 'web/components/widgets/editor'

import { useWindowSize } from 'web/hooks/use-window-size'
import { placeBet } from 'web/lib/firebase/api'
import {
  getBinaryProbPercent,
  getTrendingContracts,
} from 'web/lib/firebase/contracts'
import { track } from 'web/lib/service/analytics'
import { fromNow } from 'web/lib/util/time'

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

  const [index, setIndex] = useState(0)
  const cards = useMemo(
    () => contracts.slice(index, index + 4).reverse(),
    [contracts, index]
  )

  // resize height manually for iOS
  const { height } = useWindowSize()

  if (!contracts) return <></>

  return (
    <main
      className="bg-greyscale-1 h-screen overflow-hidden overscroll-none lg:py-6"
      style={{ height }}
    >
      <div className="relative mx-auto h-full max-w-lg">
        {cards.map((c) => (
          <Card
            contract={c}
            onLeave={() => setIndex((i) => i + 1)}
            key={c.id}
          />
        ))}
      </div>
    </main>
  )
}

const betTapAdd = 10
// const betHoldAdd = 100

const Card = (props: { contract: BinaryContract; onLeave?: () => void }) => {
  const { contract, onLeave } = props
  const { question, description, coverImageUrl, id: contractId } = contract

  const [amount, setAmount] = useState(10)
  const onClickMoney = () => setAmount?.((amount) => amount + betTapAdd)

  const image =
    coverImageUrl ??
    `https://picsum.photos/id/${parseInt(contract.id, 36) % 1000}/512`

  const [peek, setPeek] = useState(false)

  return (
    <>
      {peek && <Peek contract={contract} onClose={() => setPeek(false)} />}
      <TinderCard
        onSwipe={async (direction) => {
          if (direction === 'left' || direction === 'right') {
            const outcome = direction === 'left' ? 'NO' : 'YES'
            await placeBet({ amount, outcome, contractId })
            track('bet', {
              location: 'swipe',
              outcomeType: 'BINARY',
              slug: contract.slug,
              contractId,
              amount,
              outcome,
              isLimitOrder: false,
            })
          }
          if (direction === 'down') {
            setPeek(true)
          }
        }}
        onCardLeftScreen={onLeave}
        preventSwipe={['down']}
        className={'absolute inset-2 cursor-grab [&>*]:last:scale-100'}
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
            <Percents contract={contract} amount={amount} />
            {/* TODO: use editor excluding widgets */}
            <div className="prose prose-invert prose-sm text-greyscale-1 line-clamp-3 mx-8">
              {typeof description === 'string'
                ? description
                : richTextToString(description)}
            </div>
            <div className="mb-4 flex flex-col items-center gap-2 self-center text-yellow-100">
              Swipe ⭤ to bet
              <button
                onClick={onClickMoney}
                onTouchStart={onClickMoney}
                className="rounded-full border border-yellow-400 px-12 py-4 font-bold text-yellow-300 transition-colors focus:bg-yellow-200/20 active:bg-yellow-400 active:text-white"
              >
                {formatMoney(amount)}
              </button>
            </div>
          </div>
        </div>
      </TinderCard>
    </>
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
          <div className="text-greyscale-1 ">
            trading closes {fromNow(closeTime)}
          </div>
        )}
      </div>
    </div>
  )
}

const Percents = (props: { contract: BinaryContract; amount: number }) => {
  const { contract, amount } = props
  const percent = getBinaryProbPercent(contract)

  return (
    <div className="flex items-center justify-evenly text-2xl font-semibold">
      <div className="text-scarlet-200 text-center [text-shadow:#991600_4px_-2px]">
        {formatPercent(
          1 - getOutcomeProbabilityAfterBet(contract, 'NO', amount)
        )}{' '}
        ←
      </div>
      <div className="text-7xl text-white [text-shadow:#4337c9_0_6px]">
        {percent}
      </div>{' '}
      <div className="text-center text-teal-200 [text-shadow:#0f766e_-4px_2px]">
        →{' '}
        {formatPercent(getOutcomeProbabilityAfterBet(contract, 'YES', amount))}
      </div>
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
        <h1 className="mb-8 text-lg font-semibold text-indigo-700">
          {question}
        </h1>
        <Content size="sm" content={description} />
      </div>
    </section>
  )
}
