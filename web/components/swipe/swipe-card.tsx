import clsx from 'clsx'

import { track } from '@amplitude/analytics-browser'
import { animated, useSpring } from '@react-spring/web'
import { rubberbandIfOutOfBounds, useDrag } from '@use-gesture/react'
import { getOutcomeProbabilityAfterBet } from 'common/calculate'
import { BinaryContract, Contract } from 'common/contract'
import { getBinaryProb } from 'common/contract-details'
import { User } from 'common/user'
import {
  CSSProperties,
  memo,
  ReactNode,
  SetStateAction,
  useEffect,
  useState,
} from 'react'
import { LikeButton } from 'web/components/contract/like-button'
import { useContract } from 'web/hooks/use-contracts'
import { placeBet } from 'web/lib/firebase/api'
import { contractPath } from 'web/lib/firebase/contracts'
import { logView } from 'web/lib/firebase/views'
import { fromNow } from 'web/lib/util/time'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import { SiteLink } from '../widgets/site-link'
import { SwipeBetPanel } from './swipe-bet-panel'
import getQuestionSize, {
  getSwipeAction,
  horizontalSwipeDist,
  isStatusAFailure,
  SwipeAction,
  verticalSwipeDist,
} from './swipe-helpers'
import Percent, { DescriptionAndModal } from './swipe-widgets'

export const SwipeCard = memo(
  (props: {
    contract: BinaryContract
    amount: number
    swipeBetPanel: ReactNode
    className?: string
    action?: SwipeAction
    buttonAction?: 'YES' | 'NO' | undefined
    user?: User
    isModalOpen?: boolean
    setIsModalOpen?: (open: boolean) => void
    style?: CSSProperties
  }) => {
    const {
      amount,
      swipeBetPanel,
      className,
      action,
      buttonAction,
      user,
      isModalOpen,
      setIsModalOpen,
      style,
    } = props
    const contract = (useContract(props.contract.id) ??
      props.contract) as BinaryContract
    const { question, description, coverImageUrl } = contract
    const image =
      coverImageUrl ??
      `https://picsum.photos/id/${parseInt(contract.id, 36) % 1000}/512`
    const [currPercent, _setCurrPercent] = useState(getBinaryProb(contract))
    const [noPercent, setNoPercent] = useState(
      1 - getOutcomeProbabilityAfterBet(contract, 'NO', amount)
    )
    const [yesPercent, setYesPercent] = useState(
      getOutcomeProbabilityAfterBet(contract, 'YES', amount)
    )

    useEffect(() => {
      setNoPercent(1 - getOutcomeProbabilityAfterBet(contract, 'NO', amount))
      setYesPercent(getOutcomeProbabilityAfterBet(contract, 'YES', amount))
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [amount])
    return (
      <Col
        className={clsx(
          className,
          'relative h-full w-full select-none drop-shadow-2xl'
        )}
        style={style}
        onClick={(e) => e.preventDefault()}
      >
        <Col className="h-full">
          {/* <div className="h-24 bg-black" /> */}
          <div className="relative flex grow">
            <img
              src={image}
              alt=""
              className="flex grow bg-black object-cover brightness-75"
            />
            <div className="absolute top-0 z-0 h-[10%] w-full bg-gradient-to-b from-black via-black/60 to-transparent" />
            <div className="absolute bottom-0 z-0 h-[30%] w-full bg-gradient-to-t from-black via-black/60 to-transparent" />
          </div>
          {/* <div className="h-20 w-full bg-black" /> */}
        </Col>
        <Col className="absolute inset-0 z-10">
          <Col className="reltive h-full gap-2 p-4">
            <CornerDetails contract={contract} />

            <div className="mt-4 mb-8 max-h-24 overflow-ellipsis">
              <SiteLink href={contractPath(contract)} followsLinkClass>
                <div
                  className={clsx(
                    'text-white drop-shadow',
                    getQuestionSize(question)
                  )}
                >
                  {question}
                </div>
              </SiteLink>

              <Row className="mt-4 w-full">
                <Percent
                  currPercent={currPercent}
                  yesPercent={yesPercent}
                  noPercent={noPercent}
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
              </Row>
            </div>

            <Row className="mx-auto w-full grow items-center" />

            <Row className="justify-end">
              <CardActions user={user} contract={contract} />
            </Row>
            <Col className="gap-6">
              <Col className="h-20 w-full justify-end">
                <DescriptionAndModal
                  description={description}
                  isModalOpen={isModalOpen}
                  setIsModalOpen={setIsModalOpen}
                />
              </Col>
              {swipeBetPanel}
            </Col>
          </Col>
        </Col>
      </Col>
    )
  }
)

const onBet = (
  outcome: 'YES' | 'NO',
  contract: BinaryContract,
  amount: number,
  setBetStatus: (status: 'loading' | 'success' | string | undefined) => void,
  setAction: (action: SwipeAction) => void,
  setButtonAction: (buttonAction: 'YES' | 'NO' | undefined) => void,
  user?: User
) => {
  const contractId = contract.id
  setBetStatus('loading')
  const promise = placeBet({ amount, outcome, contractId })
  promise
    .then(() => setBetStatus('success'))
    .catch((e) => {
      setBetStatus(e.message)
      setAction('none')
      setButtonAction(undefined)
    })
  if (user) logView({ amount, outcome, contractId, userId: user.id })
  track('swipe bet', {
    slug: contract.slug,
    contractId,
    amount,
    outcome,
  })
}

export function CurrentSwipeCards(props: {
  contract: BinaryContract
  index: number
  setIndex: (next: SetStateAction<number>) => void
  cardHeight: number
  user?: User
  previousContract?: BinaryContract
  nextContract?: BinaryContract
  className?: string
}) {
  const {
    index,
    setIndex,
    user,
    cardHeight,
    previousContract,
    nextContract,
    className,
  } = props
  const contract = (useContract(props.contract.id) ??
    props.contract) as BinaryContract

  const [amount, setAmount] = useState(10)
  const [action, setAction] = useState<SwipeAction>('none')
  const [swipeAction, setSwipeAction] = useState<SwipeAction>('none')
  const [betStatus, setBetStatus] = useState<
    'loading' | 'success' | string | undefined
  >(undefined)
  const [buttonAction, setButtonAction] = useState<'YES' | 'NO' | undefined>(
    undefined
  )

  const [{ x, y }, api] = useSpring(() => ({
    x: 0,
    y: 0,
    config: { tension: 1000, friction: 50, clamp: true },
  }))

  const onButtonBet = (outcome: 'YES' | 'NO') => {
    onBet(
      outcome,
      contract,
      amount,
      setBetStatus,
      setAction,
      setButtonAction,
      user
    )
    setButtonAction(outcome)
  }

  // Animate movement when bet is made.
  useEffect(() => {
    if (betStatus === 'success') {
      const direction = buttonAction === 'YES' || action === 'right' ? 1 : -1
      setTimeout(() => {
        const x = direction * (cardHeight + 16)
        api.start({ x })
      }, 450)

      setTimeout(() => {
        setIndex(index + 1)
      }, 600)
    }
    if (isStatusAFailure(betStatus)) {
      const x = 0
      api.start({ x })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [betStatus])

  useEffect(() => {
    if (action === 'right' || action === 'left') {
      // Horizontal swipe is triggered, places bet
      const outcome = action === 'right' ? 'YES' : 'NO'
      onBet(
        outcome,
        contract,
        amount,
        setBetStatus,
        setAction,
        setButtonAction,
        user
      )
    }
    if (action === 'up') {
      api.start({ y: -1 * cardHeight })

      const timeoutId = setTimeout(() => {
        setIndex(index + 1)
      }, 200)
      return () => {
        setIndex(index + 1)
        clearTimeout(timeoutId)
      }
    }
    if (action === 'down') {
      if (previousContract) {
        api.start({ y: cardHeight })

        const timeoutId = setTimeout(() => {
          setIndex(index - 1)
        }, 200)
        return () => {
          setIndex(index - 1)
          clearTimeout(timeoutId)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action])

  const bind = useDrag(
    ({ down, movement: [mx, my] }) => {
      const xCappedDist = rubberbandIfOutOfBounds(
        Math.abs(mx),
        0,
        horizontalSwipeDist
      )
      const swipeAction = getSwipeAction(mx, my, xCappedDist)
      setSwipeAction(swipeAction)
      if (!down) {
        // See if thresholds show if an action was made once thumb is lifted
        setAction(swipeAction)
      }
      const x = down ? Math.sign(mx) * xCappedDist : 0
      const y = down || Math.abs(my) >= verticalSwipeDist ? my : 0
      api.start({ x, y })
    },
    { axis: 'lock' }
  )

  const [isModalOpen, setIsModalOpen] = useState(false)

  const swipeBetPanel = (
    <SwipeBetPanel
      setAmount={setAmount as any}
      amount={amount}
      disabled={false}
      swipeAction={swipeAction}
      onButtonBet={onButtonBet}
      buttonAction={buttonAction}
      betStatus={betStatus}
    />
  )

  return (
    <animated.div
      {...bind()}
      className={clsx(
        className,
        'pointer-events-auto absolute h-full w-full max-w-lg touch-none select-none transition-transform duration-75'
      )}
      style={{ x, y }}
      onClick={(e) => e.preventDefault()}
    >
      {previousContract && (
        <SwipeCard
          key={previousContract.id}
          style={{ position: 'absolute', top: -cardHeight }}
          contract={previousContract}
          amount={amount}
          swipeBetPanel={swipeBetPanel}
          user={user}
          isModalOpen={false}
          setIsModalOpen={setIsModalOpen}
        />
      )}

      <SwipeCard
        key={contract.id}
        contract={contract}
        amount={amount}
        swipeBetPanel={swipeBetPanel}
        action={swipeAction}
        buttonAction={buttonAction}
        user={user}
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
      />

      {nextContract && (
        <SwipeCard
          key={nextContract.id}
          contract={nextContract}
          amount={amount}
          swipeBetPanel={swipeBetPanel}
          user={user}
          isModalOpen={false}
          setIsModalOpen={setIsModalOpen}
        />
      )}
    </animated.div>
  )
}

const CornerDetails = (props: { contract: Contract; className?: string }) => {
  const { contract, className } = props
  const { creatorName, creatorAvatarUrl, closeTime } = contract

  return (
    <div className={clsx('flex gap-2 self-start', className)}>
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

function CardActions(props: { user?: User; contract: BinaryContract }) {
  const { user, contract } = props

  return (
    <Col className="flex flex-col items-center justify-end">
      <LikeButton
        contentId={contract.id}
        contentCreatorId={contract.creatorId}
        user={user}
        contentType={'contract'}
        totalLikes={contract.likedByUserCount ?? 0}
        contract={contract}
        contentText={contract.question}
        size={'xl'}
        showTotalLikesUnder={true}
        color={'white'}
        className={'drop-shadow-sm'}
      />
      {/* TODO Share button */}
    </Col>
  )
}
