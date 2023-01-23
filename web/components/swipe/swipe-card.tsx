import clsx from 'clsx'

import { track } from '@amplitude/analytics-browser'
import { animated, useSpring } from '@react-spring/web'
import { rubberbandIfOutOfBounds, useDrag } from '@use-gesture/react'
import { getOutcomeProbabilityAfterBet } from 'common/calculate'
import { BinaryContract, Contract } from 'common/contract'
import { getBinaryProb } from 'common/contract-details'
import { User } from 'common/user'
import { memo, ReactNode, SetStateAction, useEffect, useState } from 'react'
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
  STARTING_BET_AMOUNT,
  SwipeAction,
  verticalSwipeDist,
} from './swipe-helpers'
import Percent, { DescriptionAndModal } from './swipe-widgets'

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

const PREVIOUS_CARD_BUFFER = 16

export function PreviousSwipeCard(props: {
  contract: BinaryContract
  yPosition: number | null
  cardHeight: number
}) {
  const { yPosition, cardHeight } = props
  const [{ x, y }, api] = useSpring(() => ({
    x: 0,
    y: -(cardHeight + PREVIOUS_CARD_BUFFER),
    config: { tension: 1000, friction: 70 },
  }))

  const contract = (useContract(props.contract.id) ??
    props.contract) as BinaryContract

  useEffect(() => {
    console.log(yPosition)
    const y =
      yPosition != null
        ? -(cardHeight + PREVIOUS_CARD_BUFFER) + yPosition
        : -(cardHeight + PREVIOUS_CARD_BUFFER)
    api.start({ y })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yPosition])
  return (
    <>
      <animated.div
        key={contract.id}
        className={clsx(
          'user-select-none pointer-events-auto absolute inset-1 z-20 touch-none transition-transform duration-75'
        )}
        style={{ x, y, height: cardHeight }}
        onClick={(e) => e.preventDefault()}
      >
        <SwipeCard
          key={contract.id}
          contract={contract}
          amount={STARTING_BET_AMOUNT}
          swipeBetPanel={
            <SwipeBetPanel amount={STARTING_BET_AMOUNT} disabled={true} />
          }
          className="h-full"
        />
      </animated.div>
    </>
  )
}

export function PrimarySwipeCard(props: {
  contract: BinaryContract
  index: number
  setIndex: (next: SetStateAction<number>) => void
  cardHeight: number
  user?: User
  previousContract?: BinaryContract
}) {
  const { index, setIndex, user, cardHeight } = props
  const contract = (useContract(props.contract.id) ??
    props.contract) as BinaryContract

  const previousContract = props.previousContract

  const [amount, setAmount] = useState(10)
  const [action, setAction] = useState<SwipeAction>('none')
  const [swipeAction, setSwipeAction] = useState<SwipeAction>('none')
  const [betStatus, setBetStatus] = useState<
    'loading' | 'success' | string | undefined
  >(undefined)
  const [buttonAction, setButtonAction] = useState<'YES' | 'NO' | undefined>(
    undefined
  )
  const [previousCardY, setPreviousCardY] = useState<number | null>(null)

  const [{ x, y }, api] = useSpring(() => ({
    x: 0,
    y: 0,
    config: { tension: 1000, friction: 70 },
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

  //animate movement when bet is made
  useEffect(() => {
    if (betStatus === 'success') {
      const direction = buttonAction === 'YES' || action === 'right' ? 1 : -1
      setTimeout(() => {
        const x = direction * (cardHeight + PREVIOUS_CARD_BUFFER)
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
      // Executes vertical swipe animation
      setTimeout(() => {
        const y = -1 * (cardHeight + PREVIOUS_CARD_BUFFER)
        api.start({ y })
      }, 100)
      setTimeout(() => {
        setIndex(index + 1)
      }, 300)
    }
    if (action === 'down') {
      // Executes vertical swipe animation
      if (previousContract) {
        setTimeout(() => {
          setPreviousCardY(cardHeight + PREVIOUS_CARD_BUFFER)
        }, 100)

        setTimeout(() => {
          setIndex(index - 1)
        }, 300)
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
      setSwipeAction(getSwipeAction(mx, my, xCappedDist))
      if (!down) {
        // See if thresholds show if an action was made once thumb is lifted
        setAction(swipeAction)
        if (swipeAction != 'down') {
          setPreviousCardY(null)
        }
      }
      const x = down ? Math.sign(mx) * xCappedDist : 0
      const y = my <= 0 && (down || Math.abs(my) >= verticalSwipeDist) ? my : 0
      if (my > 0) {
        setPreviousCardY(my)
      }
      api.start({ x, y, immediate: down })
    },
    { axis: 'lock' }
  )

  const [isModalOpen, setIsModalOpen] = useState(false)
  return (
    <>
      {previousContract && (
        <PreviousSwipeCard
          key={previousContract.id}
          contract={previousContract}
          yPosition={previousCardY}
          cardHeight={cardHeight}
        />
      )}

      <animated.div
        {...bind()}
        className={clsx(
          'user-select-none pointer-events-auto absolute inset-1 max-w-lg touch-none transition-transform duration-75'
        )}
        style={{ x, y }}
        onClick={(e) => e.preventDefault()}
      >
        <SwipeCard
          key={contract.id}
          contract={contract}
          amount={amount}
          swipeBetPanel={
            <SwipeBetPanel
              setAmount={setAmount as any}
              amount={amount}
              disabled={false}
              swipeAction={swipeAction}
              onButtonBet={onButtonBet}
              buttonAction={buttonAction}
              betStatus={betStatus}
            />
          }
          className="h-full"
          action={swipeAction}
          buttonAction={buttonAction}
          user={user}
          isModalOpen={isModalOpen}
          setIsModalOpen={setIsModalOpen}
        />
      </animated.div>
    </>
  )
}

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
      <>
        <Col
          className={clsx(className, 'relative h-full w-full drop-shadow-2xl')}
          onClick={(e) => e.preventDefault()}
        >
          <Col className="h-full">
            <div className="h-24 rounded-t-2xl bg-black" />
            <div className="relative flex grow">
              <div className="absolute top-0 z-0 h-[40%] w-full bg-gradient-to-b from-black via-black/60 to-transparent" />
              <img
                src={image}
                alt=""
                className="flex grow bg-black object-cover"
              />
              <div className="absolute bottom-0 z-0 h-[40%] w-full bg-gradient-to-t from-black via-black/60 to-transparent" />
            </div>
            <div className="h-20 w-full rounded-b-2xl bg-black" />
          </Col>
          <Col className="absolute inset-0 z-10">
            <Col className="relative h-full gap-2 p-4">
              <CornerDetails contract={contract} />
              <div className="max-h-24 overflow-ellipsis">
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
              </div>
              <Row className="mx-auto w-full grow items-center" />
              <Row className="absolute top-[40%] w-full">
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
              <Row className="justify-end">
                <Actions user={user} contract={contract} />
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
      </>
    )
  }
)

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

function Actions(props: { user?: User; contract: BinaryContract }) {
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
        size={'lg'}
        showTotalLikesUnder={true}
        color={'white'}
        className={'drop-shadow-sm'}
      />
      {/* TODO Share button */}
    </Col>
  )
}
