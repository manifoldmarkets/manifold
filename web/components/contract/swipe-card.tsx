import { track } from '@amplitude/analytics-browser'
import clsx from 'clsx'
import { useSpring, config, animated } from 'react-spring'
import { useDrag } from '@use-gesture/react'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  MinusIcon,
  PlusIcon,
} from '@heroicons/react/solid'

import { getOutcomeProbabilityAfterBet } from 'common/calculate'
import { BinaryContract, Contract } from 'common/contract'
import { getBinaryProb } from 'common/contract-details'
import { formatMoney, formatPercent } from 'common/util/format'
import { richTextToString } from 'common/util/parse'
import { memo } from 'react'
import toast from 'react-hot-toast'
import {
  usePersistentState,
  inMemoryStore,
} from 'web/hooks/use-persistent-state'
import { useUser } from 'web/hooks/use-user'
import { placeBet } from 'web/lib/firebase/api'
import { contractPath } from 'web/lib/firebase/contracts'
import { logView } from 'web/lib/firebase/views'
import { fromNow } from 'web/lib/util/time'
import { Avatar } from '../widgets/avatar'
import { SiteLink } from '../widgets/site-link'
import { VisibilityObserver } from '../widgets/visibility-observer'
import { Row } from '../layout/row'
import { Col } from '../layout/col'
import { NoLabel, YesLabel } from '../outcome-label'

const betTapAdd = 10

export const SwipeCard = memo(
  (props: {
    contract: BinaryContract
    amount: number
    setAmount: (amount: number) => void
    onView: (contract: BinaryContract, alreadyViewed: boolean) => void
    width: number
  }) => {
    const { contract, amount, setAmount, onView, width } = props
    const { question, description, coverImageUrl, id: contractId } = contract

    const [isViewed, setIsViewed] = usePersistentState(false, {
      key: contract.id + '-viewed',
      store: inMemoryStore(),
    })

    const onBet = (outcome: 'YES' | 'NO') => {
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
      track('scroll bet', {
        slug: contract.slug,
        contractId,
        amount,
        outcome,
      })
    }

    const maxSwipeDist = width * 0.25

    const [{ x }, set] = useSpring(() => ({
      x: 0,
      config: config.stiff,
    }))

    const bind = useDrag(
      ({ down, movement: [mx] }) => {
        const cappedDist = Math.min(Math.abs(mx), maxSwipeDist)
        if (!down && cappedDist >= maxSwipeDist) {
          const outcome = Math.sign(mx) > 0 ? 'YES' : 'NO'
          console.log('swipe!', outcome, cappedDist, mx, Math.sign(mx))
          onBet(outcome)
        }

        set.start({ x: down ? Math.sign(mx) * cappedDist : 0 })
      },
      { preventScroll: true }
    )

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

    return (
      <div className="relative h-full snap-start snap-always overscroll-none bg-black">
        <Col
          className="absolute h-full items-center justify-center bg-green-700 text-2xl text-white"
          style={{ left: -8, width: maxSwipeDist + 16 }}
        >
          YES
        </Col>
        <Col
          className="absolute h-full items-center justify-center bg-red-700 text-2xl text-white"
          style={{ right: -8, width: maxSwipeDist + 16 }}
        >
          NO
        </Col>

        <animated.div
          {...bind()}
          className={clsx(
            'user-select-none flex h-full flex-col overscroll-none'
          )}
          style={{
            touchAction: 'pan-y',
            transform: x.to((x) => `translateX(${x}px)`),
            left: 0,
            right: 0,
            bottom: 0,
            top: 0,
          }}
          id={contract.id}
          onClick={(e) => e.preventDefault()}
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
              className="line-clamp-6 mx-8 mt-auto mb-4 text-2xl text-white"
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

            <SwipeStatus />

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
        </animated.div>
      </div>
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

const SwipeStatus = () => {
  return (
    <Row className="items-center justify-center text-yellow-100">
      <YesLabel /> <ArrowRightIcon className="h-6 text-teal-600" />
      <span className="mx-4 whitespace-nowrap text-yellow-100">
        Swipe to bet
      </span>
      <ArrowLeftIcon className="text-scarlet-600 h-6" /> <NoLabel />
    </Row>
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
