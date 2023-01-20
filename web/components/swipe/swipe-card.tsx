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
  BUFFER_CARD_COLOR,
  BUFFER_CARD_OPACITY,
  isStatusAFailure,
  STARTING_BET_AMOUNT,
} from './swipe-helpers'
import Percent, { DescriptionAndModal } from './swipe-widgets'

const horizontalSwipeDist = 80
const verticalSwipeDist = -100

export type SwipeAction = 'left' | 'right' | 'up' | 'down' | 'none'

function getSwipeAction(
  mx: number,
  my: number,
  cappedDist: number
): SwipeAction {
  if (cappedDist >= horizontalSwipeDist) {
    return mx < 0 ? 'left' : 'right'
  }
  if (my <= verticalSwipeDist) {
    return 'up'
  }
  if (my >= Math.abs(verticalSwipeDist)) {
    return 'down'
  }
  return 'none'
}

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

export function PreviousSwipeCard(props: {
  contract: BinaryContract
  yPosition: number | undefined
  cardHeight: number
}) {
  const { yPosition, cardHeight } = props
  const [{ x, y }, api] = useSpring(() => ({
    x: 0,
    y: -(cardHeight + 8),
    config: { tension: 1000, friction: 70 },
  }))

  const contract = (useContract(props.contract.id) ??
    props.contract) as BinaryContract

  useEffect(() => {
    const y = yPosition ? -(cardHeight + 8) + yPosition : -(cardHeight + 8)
    api.start({ y })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yPosition])

  return (
    <>
      <animated.div
        key={contract.id}
        className={clsx(
          'user-select-none pointer-events-auto absolute inset-1 z-20 touch-none'
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
  wentToPreviousCard: boolean
  setWentToPreviousCard: (wtpc: SetStateAction<boolean>) => void
  user?: User
  previousContract?: BinaryContract
}) {
  const {
    index,
    setIndex,
    user,
    cardHeight,
    wentToPreviousCard,
    setWentToPreviousCard,
  } = props
  const contract = (useContract(props.contract.id) ??
    props.contract) as BinaryContract

  const previousContract = props.previousContract

  const [amount, setAmount] = useState(10)
  const [action, setAction] = useState<SwipeAction>('none')
  const [betStatus, setBetStatus] = useState<
    'loading' | 'success' | string | undefined
  >(undefined)
  const [buttonAction, setButtonAction] = useState<'YES' | 'NO' | undefined>(
    undefined
  )
  const [isFreshCard, setIsFreshCard] = useState(!wentToPreviousCard)
  if (isFreshCard) {
    setTimeout(() => setIsFreshCard(false), 10)
  }

  const [previousCardY, setPreviousCardY] = useState<number | undefined>(
    undefined
  )

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
        const x = direction * (cardHeight + 8)
        api.start({ x })
      }, 450)

      setTimeout(() => {
        setIndex(index + 1)
      }, 550)
    }
    if (isStatusAFailure(betStatus)) {
      const x = 0
      api.start({ x })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [betStatus])

  const bind = useDrag(
    ({ down, movement: [mx, my] }) => {
      let direction = 0
      const cappedDist = rubberbandIfOutOfBounds(
        Math.abs(mx),
        0,
        horizontalSwipeDist
      )
      setAction(getSwipeAction(mx, my, cappedDist))
      if (!down) {
        // See if thresholds show if an action was made once thumb is lifted
        if (action === 'right' || action === 'left') {
          // Horizontal swipe is triggered, places bet
          setWentToPreviousCard(false)
          direction = Math.sign(mx)
          const outcome = direction > 0 ? 'YES' : 'NO'
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
            const y = -1 * (cardHeight + 8)
            api.start({ y })
          }, 100)
          setTimeout(() => {
            setWentToPreviousCard(false)
            setIndex(index + 1)
          }, 200)
        }
        if (action === 'down') {
          // Executes vertical swipe animation
          if (previousContract) {
            setTimeout(() => {
              setPreviousCardY(cardHeight + 8)
            }, 100)

            setTimeout(() => {
              setIndex(index - 1)
              setWentToPreviousCard(true)
            }, 300)
          }
        } else {
          api.start({ x: 0, y: 0 })
          setPreviousCardY(undefined)
        }
      } else {
        const x = down ? Math.sign(mx) * cappedDist : 0
        const y = down ? (my < 0 ? my : 0) : 0
        if (my > 0) {
          setPreviousCardY(my)
        } else {
          setPreviousCardY(undefined)
        }
        if (action === 'none') {
          api.start({ x, y })
        }
      }
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
      {!wentToPreviousCard && (
        <Col
          className={clsx(
            'absolute inset-1 z-10 max-w-lg rounded-2xl transition-opacity duration-300 ease-in-out',
            BUFFER_CARD_COLOR,
            isFreshCard || (action === 'down' && previousContract)
              ? BUFFER_CARD_OPACITY
              : 'opacity-0',
            isModalOpen ? 'pointer-events-auto' : 'pointer-events-none'
          )}
        />
      )}

      <animated.div
        {...bind()}
        className={clsx(
          'user-select-none pointer-events-auto absolute inset-1 max-w-lg touch-none'
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
              swipeAction={action}
              onButtonBet={onButtonBet}
              buttonAction={buttonAction}
              betStatus={betStatus}
            />
          }
          className="h-full"
          action={action}
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
              <img src={image} alt="" className="flex grow object-cover" />
              <div className="absolute bottom-0 z-0 h-[40%] w-full bg-gradient-to-t from-black via-black/60 to-transparent" />
            </div>
            <div className="h-20 w-full rounded-b-2xl bg-black" />
          </Col>
          <Col className="absolute inset-0 z-10">
            <Col className="relative h-full gap-2 p-4">
              <CornerDetails contract={contract} />
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
              <Row className="mx-auto w-full grow items-center" />

              <Row className="absolute top-[45%] w-full items-center">
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
