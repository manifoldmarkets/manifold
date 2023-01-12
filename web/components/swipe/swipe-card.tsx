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
import getQuestionSize, {
  BUFFER_CARD_COLOR,
  BUFFER_CARD_OPACITY,
} from './swipe-helpers'

const betTapAdd = 10
const horizontalSwipeDist = 80
const verticalSwipeDist = -100
const overrideVerticalSwipeDist = -150

type SwipeAction = 'left' | 'right' | 'up' | 'none'

function getSwipeAction(mx: number, my: number): SwipeAction {
  if (Math.abs(mx) > horizontalSwipeDist && my > overrideVerticalSwipeDist) {
    return mx < 0 ? 'left' : 'right'
  }
  if (my <= verticalSwipeDist) {
    return 'up'
  }
  return 'none'
}

const onBet = (
  outcome: 'YES' | 'NO',
  contract: BinaryContract,
  amount: number,
  user?: User
) => {
  const contractId = contract.id

  const promise = placeBet({ amount, outcome, contractId })

  const shortQ = contract.question.slice(0, 20)
  const message = `Bet ${formatMoney(amount)} ${outcome} on "${shortQ}"...`

  // toast.promise(
  //   promise,
  //   {
  //     loading: message,
  //     success: message,
  //     error: (err) => `Error placing bet: ${err.message}`,
  //   },
  //   { position: 'top-center' }
  // )

  if (user) logView({ amount, outcome, contractId, userId: user.id })
  track('swipe bet', {
    slug: contract.slug,
    contractId,
    amount,
    outcome,
  })
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
  const [action, setAction] = useState<SwipeAction>('none')
  const [buttonAction, setButtonAction] = useState<'YES' | 'NO' | undefined>(
    undefined
  )

  //
  const [isFreshCard, setIsFreshCard] = useState(true)
  setTimeout(() => setIsFreshCard(false), 10)

  const [{ x, y }, api] = useSpring(() => ({
    x: 0,
    y: 0,
    config: { tension: 1000, friction: 70 },
  }))

  const onButtonBet = (outcome: 'YES' | 'NO') => {
    onBet(outcome, contract, amount, user)
    setButtonAction(outcome)
  }

  useEffect(() => {
    if (buttonAction) {
      const direction = buttonAction === 'YES' ? 1 : -1
      setTimeout(() => {
        const x = direction * window.innerWidth
        api.start({ x })
      }, 450)

      setTimeout(() => {
        setIndex(index + 1)
      }, 550)
    }
  }, [buttonAction])

  const bind = useDrag(
    ({ down, movement: [mx, my] }) => {
      let direction = 0
      setAction(getSwipeAction(mx, my))
      if (!down) {
        // See if thresholds show if an action was made once thumb is lifted
        if (action === 'right' || action === 'left') {
          // Horizontal swipe is triggered, places bet
          direction = Math.sign(mx)
          const outcome = direction > 0 ? 'YES' : 'NO'
          onBet(outcome, contract, amount, user)
          setTimeout(() => {
            const x = direction * window.innerWidth
            api.start({ x })
          }, 200)

          setTimeout(() => {
            setIndex(index + 1)
          }, 300)
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
      }
      const x = down ? mx : 0
      const y = down ? (my < 0 ? my : 0) : 0

      // console.log(mx, my, action)
      if (action === 'none') {
        api.start({ x, y })
      }
    },
    { axis: 'lock' }
  )
  return (
    <>
      <Col
        className={clsx(
          'pointer-events-none absolute inset-1 z-10 max-w-lg transition-opacity duration-300 ease-in-out',
          BUFFER_CARD_COLOR,
          isFreshCard ? BUFFER_CARD_OPACITY : 'opacity-0'
        )}
      />

      <animated.div
        {...bind()}
        className={clsx(
          'user-select-none pointer-events-auto absolute inset-1 max-w-lg touch-none'
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
          className="h-full"
          action={action}
          onButtonBet={onButtonBet}
          buttonAction={buttonAction}
          user={user}
        />
      </animated.div>
    </>
  )
}

export const SwipeCard = memo(
  (props: {
    contract: BinaryContract
    amount: number
    setAmount: (amount: number) => void
    isPrimaryCard?: boolean
    className?: string
    action?: SwipeAction
    onButtonBet?: (outcome: 'YES' | 'NO') => void
    buttonAction?: 'YES' | 'NO' | undefined
    user?: User
  }) => {
    const {
      amount,
      setAmount,
      isPrimaryCard,
      className,
      action,
      onButtonBet,
      buttonAction,
      user,
    } = props
    const contract = (useContract(props.contract.id) ??
      props.contract) as BinaryContract
    const { question, description, coverImageUrl } = contract
    const image =
      coverImageUrl ??
      `https://picsum.photos/id/${parseInt(contract.id, 36) % 1000}/512`
    return (
      <>
        <Col
          className={clsx(className, 'drop-shadow-2xl')}
          onClick={(e) => e.preventDefault()}
        >
          <div className="h-24 w-full rounded-t-2xl bg-black">
            <CornerDetails contract={contract} />
          </div>
          <div className="relative grow bg-black">
            <div className="absolute z-0 min-h-[30%] w-full bg-gradient-to-b from-black to-transparent pb-60" />
            <SiteLink
              className="absolute -top-9 z-10"
              href={contractPath(contract)}
              followsLinkClass
            >
              <div
                className={clsx(
                  'mx-4 text-white drop-shadow',
                  getQuestionSize(question)
                )}
              >
                {question}
              </div>
            </SiteLink>
            <div className="absolute top-28 left-[calc(50%-80px)] z-10 mx-auto">
              <Percent
                contract={contract}
                amount={amount}
                outcome={
                  buttonAction === 'YES'
                    ? 'YES'
                    : buttonAction === 'NO'
                    ? 'NO'
                    : action === 'left'
                    ? 'NO'
                    : action === 'right'
                    ? 'YES'
                    : undefined
                }
              />
            </div>
            <div className="absolute right-4 bottom-24">
              <Actions user={user} contract={contract} />
            </div>

            <Col className="absolute -bottom-20 z-10 w-full gap-6">
              <div className="prose prose-invert prose-sm line-clamp-3 mx-4 text-gray-50">
                {typeof description === 'string'
                  ? description
                  : richTextToString(description)}
              </div>
              <SwipeBetPanel
                setAmount={setAmount as any}
                amount={amount}
                disabled={!isPrimaryCard}
                swipeAction={action}
                onButtonBet={onButtonBet}
                buttonAction={buttonAction}
              />
            </Col>
            <div className="absolute bottom-0 z-0 min-h-[30%] w-full bg-gradient-to-b from-transparent to-black pb-4" />
            <img src={image} alt="" className="h-full object-cover" />
          </div>
          <div className="h-20 w-full rounded-b-2xl bg-black" />
        </Col>
      </>
    )
  }
)

export function SwipeBetPanel(props: {
  setAmount: (setAmount: (amount: number) => void) => void
  amount: number
  disabled?: boolean
  swipeAction?: SwipeAction
  onButtonBet?: (outcome: 'YES' | 'NO') => void
  buttonAction?: 'YES' | 'NO' | undefined
}) {
  const {
    setAmount,
    amount,
    disabled,
    swipeAction,
    onButtonBet,
    buttonAction,
  } = props
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
      <Row className="relative items-center gap-0.5 text-white">
        <button
          className={clsx(
            'absolute -left-[88px] z-20 flex h-16 flex-col justify-center rounded-[4rem] border-2 font-semibold transition-all',
            !disabled
              ? 'active:bg-scarlet-500 active:border-scarlet-500 active:text-white'
              : 'w-16 border-gray-200 pl-4 text-gray-200',
            !disabled && (buttonAction === 'NO' || swipeAction === 'left')
              ? 'bg-scarlet-500 border-scarlet-500 w-[188px] pl-[84px] text-white'
              : 'border-scarlet-200 text-scarlet-200 w-16 pl-4'
          )}
          disabled={disabled}
          onClick={() => {
            if (onButtonBet) {
              onButtonBet('NO')
            }
          }}
        >
          NO
        </button>
        <TouchButton
          pressState={'sub'}
          setPressState={setPressState}
          disabled={disabled}
          children={
            <MinusIcon className="active:text-blackz z-10 h-6 w-6 rounded-full border p-1 transition-colors active:bg-white" />
          }
          className={'opacity-70'}
        />

        <Row className="z-30 mx-1 w-10 justify-center py-4">
          {disabled ? formatMoney(10) : formatMoney(amount)}
        </Row>

        <TouchButton
          pressState={'add'}
          setPressState={setPressState}
          disabled={disabled}
          children={
            <PlusIcon className="z-10 h-6 w-6 rounded-full border p-1 transition-colors active:bg-white active:text-black" />
          }
          className={'opacity-70'}
        />
        <button
          className={clsx(
            'absolute -right-[88px] z-20 flex h-16 flex-col justify-center rounded-full border-2 font-semibold transition-all active:border-teal-600 active:bg-teal-600 active:text-white',
            !disabled && (buttonAction === 'YES' || swipeAction === 'right')
              ? 'w-[188px] border-teal-600 bg-teal-600 pl-[74px] text-white'
              : 'w-16 border-teal-300 bg-inherit pl-[13px] text-teal-300'
          )}
          disabled={disabled}
          onClick={() => {
            if (onButtonBet) {
              onButtonBet('YES')
            }
          }}
        >
          YES
        </button>
      </Row>
    </Row>
  )
}

const CornerDetails = (props: { contract: Contract; className?: string }) => {
  const { contract, className } = props
  const { creatorName, creatorAvatarUrl, closeTime } = contract

  return (
    <div className={clsx('m-4 flex gap-2 self-start', className)}>
      <Avatar size="sm" avatarUrl={creatorAvatarUrl} noLink />
      <div className="text-xs">
        <div className="text-white">{creatorName} </div>
        {closeTime != undefined && (
          <div className="text-gray-400 ">
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
    <Col className="flex flex-col items-center justify-center">
      <LikeButton
        contentId={contract.id}
        contentCreatorId={contract.creatorId}
        user={user}
        contentType={'contract'}
        totalLikes={contract.likedByUserCount ?? 0}
        contract={contract}
        contentText={contract.question}
        // className="scale-200 text-white"
        size={'lg'}
        showTotalLikesUnder={true}
        color={'white'}
      />
      {/* TODO Share button */}
    </Col>
  )
}
