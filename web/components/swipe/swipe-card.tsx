import clsx from 'clsx'

import {
  getDisplayProbability,
  getOutcomeProbabilityAfterBet,
} from 'common/calculate'
import { BinaryContract, Contract, contractPath } from 'common/contract'
import { User } from 'common/user'
import { Dispatch, memo, SetStateAction, useEffect, useState } from 'react'
import { LikeButton } from 'web/components/contract/like-button'
import { useRealtimeContract } from 'web/hooks/use-contract-supabase'
import { fromNow } from 'web/lib/util/time'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import { SiteLink } from '../widgets/site-link'
import { SwipeBetPanel } from './swipe-bet-panel'
import getQuestionSize from './swipe-helpers'
import { MoreSwipeInfo } from './more-swipe-info'
import { SwipeComments } from './swipe-comments'
import { Percent } from './percent'
import { SwitchHorizontalIcon } from '@heroicons/react/solid'

export const SwipeCard = memo(
  (props: {
    contract: BinaryContract
    amount: number
    setAmount: Dispatch<SetStateAction<number>>
    betDirection: 'YES' | 'NO' | undefined
    betStatus: 'loading' | 'success' | string | undefined
    onBet: (outcome: 'YES' | 'NO') => void
    user: User | undefined
    setIsModalOpen: Dispatch<SetStateAction<boolean>>
    cardHeight: number
    toggleView?: () => void
    small?: boolean
    className?: string
  }) => {
    const {
      className,
      amount,
      setAmount,
      betDirection,
      betStatus,
      onBet,
      user,
      setIsModalOpen,
      cardHeight,
      small,
      toggleView,
    } = props
    const contract = (useRealtimeContract(props.contract.id) ??
      props.contract) as BinaryContract
    const { question, coverImageUrl } = contract

    const image =
      coverImageUrl ??
      `https://picsum.photos/id/${parseInt(contract.id, 36) % 1000}/512`

    const [currPercent] = useState(getDisplayProbability(contract))
    const [noPercent, setNoPercent] = useState(
      1 - getOutcomeProbabilityAfterBet(contract, 'NO', amount)
    )
    const [yesPercent, setYesPercent] = useState(
      getOutcomeProbabilityAfterBet(contract, 'YES', amount)
    )

    useEffect(() => {
      setNoPercent(1 - getOutcomeProbabilityAfterBet(contract, 'NO', amount))
      setYesPercent(getOutcomeProbabilityAfterBet(contract, 'YES', amount))
    }, [amount])
    return (
      <Col
        className={clsx(className, 'relative h-full w-full select-none')}
        onClick={(e) => e.preventDefault()}
      >
        <Col className={clsx(small ? 'absolute' : 'relative', 'h-full grow')}>
          <img
            src={image}
            alt=""
            className="flex grow bg-black object-cover brightness-[40%]"
          />
          <div className="absolute top-0 z-0 h-[10%] w-full bg-gradient-to-b from-black via-black/60 to-transparent" />
          <div className="absolute bottom-0 z-0 h-[30%] w-full bg-gradient-to-t from-black via-black/60 to-transparent" />
        </Col>
        <Col
          className={clsx(
            !small && 'absolute',
            'inset-0 z-10 h-full gap-2 p-4'
          )}
        >
          <CornerDetails
            contract={contract}
            user={user}
            toggleView={toggleView}
          />

          <div className="line-clamp-6 mt-6 overflow-ellipsis">
            <SiteLink href={contractPath(contract)} followsLinkClass>
              <div
                className={clsx(
                  'font-semibold text-white [text-shadow:_0_1px_0_rgb(0_0_0_/_40%)]',
                  getQuestionSize(question, cardHeight)
                )}
              >
                {question}
              </div>
            </SiteLink>
          </div>

          <div className="grid grow grid-cols-[1fr_auto_1fr]">
            {/* center */}
            <div className="col-start-2">
              <Percent
                className="mt-6"
                currPercent={currPercent}
                yesPercent={yesPercent}
                noPercent={noPercent}
                outcome={
                  betDirection === 'YES'
                    ? 'YES'
                    : betDirection === 'NO'
                    ? 'NO'
                    : undefined
                }
              />
            </div>
            {/* right */}
            <CardActions
              className="col-start-3 justify-self-end"
              user={user}
              contract={contract}
              setIsModalOpen={setIsModalOpen}
            />
          </div>

          <Col className="mt-2 gap-6">
            <Col className="h-20 w-full justify-end">
              <MoreSwipeInfo
                contract={contract}
                setIsModalOpen={setIsModalOpen}
              />
            </Col>
            <SwipeBetPanel
              amount={amount}
              setAmount={setAmount}
              betDirection={betDirection}
              betStatus={betStatus}
              onBet={onBet}
              disabled={false}
            />
          </Col>
        </Col>
      </Col>
    )
  }
)

const CornerDetails = (props: {
  contract: Contract
  user?: User
  className?: string
  toggleView?: () => void
}) => {
  const { contract, className, toggleView } = props
  const { creatorName, creatorUsername, creatorAvatarUrl, closeTime } = contract

  return (
    <div className={clsx('flex justify-between', className)}>
      <Row className="gap-2">
        <SiteLink href={`/${creatorUsername}`}>
          <Avatar size="sm" avatarUrl={creatorAvatarUrl} noLink />
        </SiteLink>
        <div className="text-xs">
          <SiteLink href={`/${creatorUsername}`} followsLinkClass>
            <div className="text-white">{creatorName}</div>
          </SiteLink>
          {closeTime != undefined && (
            <div className="text-ink-400 ">
              trading closes {fromNow(closeTime)}
            </div>
          )}
        </div>
      </Row>

      <div className="flex items-center rounded-full text-white">
        {toggleView && (
          <SwitchHorizontalIcon className="ml-2 h-6 w-6" onClick={toggleView} />
        )}
      </div>
    </div>
  )
}

function CardActions(props: {
  user?: User
  contract: BinaryContract
  setIsModalOpen: (open: boolean) => void
  className?: string
}) {
  const { user, contract, setIsModalOpen, className } = props

  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-end gap-4',
        className
      )}
    >
      <div className="flex flex-col items-center">
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
          color="white"
          isSwipe
        />
      </div>

      <SwipeComments contract={contract} setIsModalOpen={setIsModalOpen} />
    </div>
  )
}
