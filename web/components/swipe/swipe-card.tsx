import clsx from 'clsx'
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
import { memo, SetStateAction, useEffect, useState } from 'react'
import { contractPath } from 'web/lib/firebase/contracts'
import { fromNow } from 'web/lib/util/time'
import { Avatar } from '../widgets/avatar'
import { SiteLink } from '../widgets/site-link'
import { Row } from '../layout/row'
import { NoLabel, YesLabel } from '../outcome-label'
import { Col } from '../layout/col'
import { useContract } from 'web/hooks/use-contracts'
import { User } from 'common/user'
import { LikeButton } from 'web/components/contract/like-button'
import { TouchButton } from './touch-button'
import { animated, useSpring } from '@react-spring/web'
import { rubberbandIfOutOfBounds, useDrag } from '@use-gesture/react'
import toast from 'react-hot-toast'
import { logView } from 'web/lib/firebase/views'
import { placeBet } from 'web/lib/firebase/api'
import { track } from '@amplitude/analytics-browser'
import getQuestionSize from './swipe-helpers'

const betTapAdd = 10
const horizontalSwipeDist = 80
const verticalSwipeDist = -100
const overrideVerticalSwipeDist = -150

type SwipeDirection = 'left' | 'right' | 'up' | 'none'

function getSwipeDirection(mx: number, my: number): SwipeDirection {
  if (Math.abs(mx) > horizontalSwipeDist && my > overrideVerticalSwipeDist) {
    return mx < 0 ? 'left' : 'right'
  }
  if (my <= verticalSwipeDist) {
    return 'up'
  }
  return 'none'
}

export function PrimarySwipeCard(props: {
  contract: BinaryContract
  index: number
  setIndex: (next: SetStateAction<number>) => void
  cardHeight: number
  user?: User
}) {
  const { index, setIndex, cardHeight, user } = props
  const contract = (useContract(props.contract.id) ??
    props.contract) as BinaryContract

  const [amount, setAmount] = useState(10)

  const onBet = (outcome: 'YES' | 'NO') => {
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

  const [{ x, y }, api] = useSpring(() => ({
    x: 0,
    y: 0,
    config: { tension: 1000, friction: 70 },
  }))

  const bind = useDrag(
    ({ down, movement: [mx, my] }) => {
      let action: SwipeDirection = 'none'
      let direction = 0

      // See if thresholds show if an action was made once thumb is lifted
      if (!down) {
        action = getSwipeDirection(mx, my)
        if (action === 'right' || action === 'left') {
          // Horizontal swipe is triggered, places bet
          direction = Math.sign(mx)
          const outcome = direction > 0 ? 'YES' : 'NO'
          onBet(outcome)
        }
      }

      if (action === 'right' || action === 'left') {
        // Executes horizontal swipe animation
        setTimeout(() => {
          const x = direction * window.innerWidth
          api.start({ x })
        }, 100)

        setTimeout(() => {
          setIndex(index + 1)
        }, 200)
      }

      if (action === 'up') {
        // Executes vertical swipe animation
        setTimeout(() => {
          const y = -1 * window.innerHeight
          api.start({ y })
        }, 100)

        setTimeout(() => {
          setIndex(index + 1)
        }, 200)
      }
      const x = down ? mx : 0
      const y = down ? (my < 0 ? my : 0) : 0

      console.log(mx, my, getSwipeDirection(mx, my))
      if (action === 'none') {
        api.start({ x, y })
      }
    },
    { axis: 'lock' }
  )
  return (
    <animated.div
      {...bind()}
      className={clsx(
        'user-select-none absolute inset-1 z-20 max-w-lg touch-none'
      )}
      style={{ x, y }}
      onClick={(e) => e.preventDefault()}
    >
      <SwipeCard
        key={
          contract.description + contract.question + contract.creatorUsername
        }
        contract={contract}
        amount={amount}
        setAmount={setAmount}
        isPrimaryCard={true}
        user={user}
        className="h-full"
      />
    </animated.div>
  )
}

export const SwipeCard = memo(
  (props: {
    contract: BinaryContract
    amount: number
    setAmount: (amount: number) => void
    isPrimaryCard?: boolean
    className?: string
    user?: User
  }) => {
    const { amount, setAmount, isPrimaryCard, className, user } = props
    const contract = (useContract(props.contract.id) ??
      props.contract) as BinaryContract
    const { question, description, coverImageUrl } = contract
    const image =
      coverImageUrl ??
      `https://picsum.photos/id/${parseInt(contract.id, 36) % 1000}/512`
    const [swipeDirection, setSwipeDirection] = useState<
      'YES' | 'NO' | undefined
    >(undefined)
    // useEffect(() => {
    //   // In case of height resize, reset the y position.
    //   api.start({ y: -index * cardHeight })
    //   // eslint-disable-next-line react-hooks/exhaustive-deps
    // }, [api, cardHeight])}
    return (
      <Col
        className={clsx(className, 'rounded drop-shadow-lg')}
        onClick={(e) => e.preventDefault()}
      >
        <div className="h-24 w-full bg-black">
          <CornerDetails contract={contract} />
        </div>
        <div className="relative grow bg-black">
          <div className="absolute z-0 min-h-[30%] w-full bg-gradient-to-b from-black to-transparent pb-4" />
          <div className="absolute bottom-0 z-0 min-h-[30%] w-full bg-gradient-to-b from-transparent to-black pb-4" />
          <SiteLink
            className="absolute -top-9 z-10"
            href={contractPath(contract)}
            followsLinkClass
          >
            <div
              className={clsx(
                'mx-3 text-white drop-shadow',
                getQuestionSize(question)
              )}
            >
              {question}
            </div>
          </SiteLink>
          <div className="absolute top-32 left-24 z-10 mx-auto">
            <Percent
              contract={contract}
              amount={amount}
              outcome={swipeDirection}
            />
          </div>

          <div className="absolute -bottom-20 z-10 w-full">
            <div className="prose prose-invert prose-sm line-clamp-3 mx-8 mb-2 text-gray-50">
              {typeof description === 'string'
                ? description
                : richTextToString(description)}
            </div>
            <SwipeBetPanel
              setAmount={() => setAmount}
              amount={amount}
              disabled={!isPrimaryCard}
            />
          </div>
          <img src={image} alt="" className="h-full object-cover" />
        </div>
        <div className="h-20 w-full bg-black" />
      </Col>
    )
  }
)

export function SwipeBetPanel(props: {
  setAmount: (setAmount: (amount: number) => void) => void
  amount: number
  disabled?: boolean
}) {
  const { setAmount, amount, disabled } = props
  const [pressState, setPressState] = useState<string | undefined>(undefined)

  const processPress = () => {
    if (pressState === 'add') {
      setAmount((a) => Math.min(250, a + betTapAdd))
    }
    if (pressState === 'sub') {
      setAmount((a) => Math.max(10, a - betTapAdd))
    }
  }

  useEffect(() => {
    if (pressState) {
      processPress()
      const interval = setInterval(processPress, 200)
      return () => clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pressState])

  return (
    <Row className="mb-4 w-full justify-center gap-5">
      <Col className="border-scarlet-200 text-scarlet-200 relative h-16 w-16 items-center justify-center rounded-[4rem] border-2">
        NO
      </Col>
      <Row className="items-center gap-0.5 text-white">
        <TouchButton
          pressState={'sub'}
          setPressState={setPressState}
          disabled={disabled}
          children={
            <MinusIcon className="h-6 w-6 rounded-full border p-1 transition-colors active:bg-white active:text-black" />
          }
          className={'opacity-70'}
        />

        <span className="mx-1 py-4">
          {disabled ? formatMoney(10) : formatMoney(amount)}
        </span>

        <TouchButton
          pressState={'add'}
          setPressState={setPressState}
          disabled={disabled}
          children={
            <PlusIcon className="h-6 w-6 rounded-full border p-1 transition-colors active:bg-white active:text-black" />
          }
          className={'opacity-70'}
        />
      </Row>
      <Col className="relative h-16 w-16 items-center justify-center rounded-full border-2 border-teal-300 bg-inherit text-teal-300">
        YES
      </Col>
    </Row>
  )
}

const CornerDetails = (props: { contract: Contract; className?: string }) => {
  const { contract, className } = props
  const { creatorName, creatorAvatarUrl, closeTime } = contract

  return (
    <div className={clsx('m-3 flex gap-2 self-start', className)}>
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
        'transition-color flex w-full items-center justify-center font-bold',
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

function Actions(props: { user?: User; contract: BinaryContract }) {
  const { user, contract } = props

  return (
    <div className="flex flex-col items-center justify-center">
      <LikeButton
        contentId={contract.id}
        contentCreatorId={contract.creatorId}
        user={user}
        contentType={'contract'}
        totalLikes={contract.likedByUserCount ?? 0}
        contract={contract}
        contentText={contract.question}
        className="scale-200 text-white"
        size="xl"
      />
      {/* TODO Share button */}
    </div>
  )
}
