import clsx from 'clsx'
import { getOutcomeProbabilityAfterBet } from 'common/calculate'
import { BinaryContract } from 'common/contract'
import { formatMoney, formatPercent } from 'common/util/format'
import {
  Dispatch,
  forwardRef,
  SetStateAction,
  useMemo,
  useRef,
  useState,
} from 'react'
import TinderCard from 'react-tinder-card'
import { getColor } from 'web/components/bet/quick-bet'
import { Button } from 'web/components/buttons/button'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { useWindowSize } from 'web/hooks/use-window-size'
import { placeBet } from 'web/lib/firebase/api'
import {
  getBinaryProbPercent,
  getTrendingContracts,
} from 'web/lib/firebase/contracts'

export async function getStaticProps() {
  const contracts = (await getTrendingContracts()).filter(
    (c) => c.outcomeType === 'BINARY'
  )
  return {
    props: { contracts },
    revalidate: 500,
  }
}

export default function Swipe(props: { contracts: BinaryContract[] }) {
  const { contracts } = props

  const [index, setIndex] = useState(0)
  const current = contracts[index]
  const next = useMemo(
    () => contracts.slice(index + 1, index + 4).reverse(),
    [contracts, index]
  )

  console.log(current.question)
  console.log(next.map((c) => c.question))

  // resize height manually for iOS
  const { height } = useWindowSize()

  if (!contracts) return <></>

  return (
    <main
      className="h-screen overflow-hidden overscroll-none lg:py-6"
      style={{ height }}
    >
      <div className="relative  mx-auto h-full max-w-lg">
      {next.map((c) => (
        <Card contract={c} key={c.id} />
      ))}
      <Interface
        contract={current}
        onNext={() => setIndex((i) => i + 1)}
        key={index}
      />
      </div>
    </main>
  )
}

type CardRef = Parameters<typeof TinderCard>[0]['ref']

const Card = forwardRef(
  (
    props: {
      contract: BinaryContract
      amount?: number
      setAmount?: Dispatch<SetStateAction<number>>
      onRight?: () => void
      onLeft?: () => void
      onLeave?: () => void
    },
    ref: CardRef
  ) => {
    const { contract, amount = 10, setAmount, onRight, onLeft, onLeave } = props
    const { question, coverImageUrl } = contract
    const isTop = !!setAmount

    const image =
      coverImageUrl ??
      `https://picsum.photos/id/${parseInt(contract.id, 36) % 1000}/512`

    return (
      <TinderCard
        onSwipe={(direction) => {
          if (direction === 'left') onLeft?.()
          else if (direction === 'right') onRight?.()
        }}
        onCardLeftScreen={onLeave}
        preventSwipe={['down']}
        className={clsx('pressable absolute', isTop ? 'inset-0' : 'inset-2')}
        ref={ref}
      >
        <div className="h-full overflow-hidden rounded-2xl">
          <div className="flex h-full flex-col bg-black">
            <div className="relative mb-24 grow">
              <img src={image} alt="" className="h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent" />
            </div>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-end">
            {/* [text-shadow:red_1px_1px,#10b981_-1px_-1px] */}
            <div className="line-clamp-4 mx-8 mt-8 mb-4 text-2xl text-white">
              {question}
            </div>
            <Percent contract={contract} />
            <Button
              size="2xl"
              color="yellow"
              onClick={() => setAmount?.((amount) => amount + betTapAdd)}
              className="mt-4"
            >
              {formatMoney(amount)}
            </Button>
            <Spacer h={30} />
          </div>
        </div>
      </TinderCard>
    )
  }
)

// TODO: scale based on user's balance so they never run out
const betTapAdd = 10
// const betHoldAdd = 100

function Interface(props: { contract: BinaryContract; onNext: () => void }) {
  const { contract, onNext } = props

  const [amount, setAmount] = useState(10)
  const cardRef: CardRef = useRef(null)

  return (
    <>
      <Card
        contract={contract}
        amount={amount}
        setAmount={setAmount}
        onLeft={() =>
          placeBet({ amount, outcome: 'NO', contractId: contract.id })
        }
        onRight={() =>
          placeBet({ amount, outcome: 'YES', contractId: contract.id })
        }
        onLeave={onNext}
        ref={cardRef}
      />
      <section className="absolute bottom-0 left-0 right-0 flex flex-col items-center">
        <Row className="mb-2 items-start justify-evenly self-stretch text-lg text-white">
          <div className="flex flex-col items-end">
            <button
              className="rounded-l-full border-2 border-red-400 py-4 pl-7 pr-5 text-2xl uppercase text-red-400 hover:bg-red-900 focus:bg-red-900"
              onClick={() => cardRef.current?.swipe('left')}
            >
              No
            </button>
            {formatPercent(
              getOutcomeProbabilityAfterBet(contract, 'NO', amount)
            )}{' '}
            ←
          </div>

          <button
            className="border-2 border-blue-400 py-4 px-5 text-2xl uppercase text-blue-400 hover:bg-blue-900 focus:bg-blue-900"
            onClick={() => cardRef.current?.swipe('up')}
          >
            Skip
          </button>

          <div className="flex flex-col items-start ">
            <button
              className="text-teal rounded-r-full border-2 border-teal-500 py-4 pr-6 pl-5 text-2xl uppercase text-teal-500 hover:bg-teal-900 focus:bg-teal-900"
              onClick={() => cardRef.current?.swipe('right')}
            >
              Yes
            </button>
            →{' '}
            {formatPercent(
              getOutcomeProbabilityAfterBet(contract, 'YES', amount)
            )}
          </div>
        </Row>
      </section>
    </>
  )
}

const Percent = (props: { contract: BinaryContract }) => {
  const { contract } = props
  const percent = getBinaryProbPercent(contract)
  const textColor = `text-${getColor(contract)}`

  return <div className={clsx(textColor, 'text-5xl')}>{percent}</div>
}
