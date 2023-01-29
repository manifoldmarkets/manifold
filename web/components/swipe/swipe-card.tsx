import clsx from 'clsx'

import { getOutcomeProbabilityAfterBet } from 'common/calculate'
import { BinaryContract, Contract } from 'common/contract'
import { getBinaryProb } from 'common/contract-details'
import { User } from 'common/user'
import { Dispatch, memo, SetStateAction, useEffect, useState } from 'react'
import { LikeButton } from 'web/components/contract/like-button'
import { useContract } from 'web/hooks/use-contracts'
import { contractPath } from 'web/lib/firebase/contracts'
import { fromNow } from 'web/lib/util/time'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import { SiteLink } from '../widgets/site-link'
import { SwipeBetPanel } from './swipe-bet-panel'
import getQuestionSize from './swipe-helpers'
import Percent, { DescriptionAndModal } from './swipe-widgets'
import { DailyStats } from '../daily-stats'

export const SwipeCard = memo(
  (props: {
    contract: BinaryContract
    amount: number
    setAmount: Dispatch<SetStateAction<number>>
    betDirection: 'YES' | 'NO' | undefined
    betStatus: 'loading' | 'success' | string | undefined
    onBet: (outcome: 'YES' | 'NO') => void
    user: User | undefined
    isModalOpen: boolean
    setIsModalOpen: Dispatch<SetStateAction<boolean>>
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
      <Col
        className={clsx(className, 'relative h-full w-full select-none')}
        onClick={(e) => e.preventDefault()}
      >
        <Col className="h-full">
          {/* <div className="h-24 bg-black" /> */}
          <div className="relative flex grow">
            <img
              src={image}
              alt=""
              className="flex grow bg-black object-cover brightness-50"
            />
            <div className="absolute top-0 z-0 h-[10%] w-full bg-gradient-to-b from-black via-black/60 to-transparent" />
            <div className="absolute bottom-0 z-0 h-[30%] w-full bg-gradient-to-t from-black via-black/60 to-transparent" />
          </div>
          {/* <div className="h-20 w-full bg-black" /> */}
        </Col>
        <Col className="absolute inset-0 z-10 h-full gap-2 p-4">
          <CornerDetails contract={contract} user={user} />

          <div className="mt-8 mb-8 max-h-24 overflow-ellipsis">
            <SiteLink href={contractPath(contract)} followsLinkClass>
              <div className={clsx('text-white', getQuestionSize(question))}>
                {question}
              </div>
            </SiteLink>

            <Row className="mt-4 w-full">
              <Percent
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
}) => {
  const { contract, className, user } = props
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
            <div className="text-gray-400 ">
              trading closes {fromNow(closeTime)}
            </div>
          )}
        </div>
      </Row>

      <div className="flex rounded-full text-gray-400">
        <DailyStats user={user} showLoans={false} />
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
      />
      {/* TODO Share button */}
    </Col>
  )
}
