import { ContractComment } from 'common/comment'
import { Contract, contractPath } from 'common/contract'
import { CommentReplyHeaderWithBet, FeedCommentHeader } from './feed-comments'
import { Col } from '../layout/col'
import clsx from 'clsx'
import { memo, useState } from 'react'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { FeedTimelineItem } from 'web/hooks/use-feed-timeline'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { Content } from 'web/components/widgets/editor'
import { PrivateUser, User } from 'common/user'
import { TradesButton } from 'web/components/contract/trades-button'
import { TbDropletHeart, TbMoneybag } from 'react-icons/tb'
import { ENV_CONFIG } from 'common/envs/constants'
import { shortFormatNumber } from 'common/util/format'
import { Button } from 'web/components/buttons/button'
import { Tooltip } from 'web/components/widgets/tooltip'
import { LikeButton } from 'web/components/contract/like-button'
import { richTextToString } from 'common/util/parse'
import { isBlocked, usePrivateUser } from 'web/hooks/use-user'
import { CommentsButton } from 'web/components/comments/comments-button'
import router from 'next/router'
import { ClickFrame } from 'web/components/widgets/click-frame'
import { CardReason } from 'web/components/feed/card-reason'
import { FeedDropdown } from 'web/components/feed/card-dropdown'

export const FeedRepost = memo(function (props: {
  contract: Contract
  comment: ContractComment
  item: FeedTimelineItem
  trackingLocation: string
  user: User | null | undefined
  hide: () => void
  onReplyClick?: (comment: ContractComment) => void
  inTimeline?: boolean
}) {
  const { contract, user, item, hide, inTimeline, comment } = props
  const privateUser = usePrivateUser()
  const { userUsername, userAvatarUrl } = comment
  const { bet, dataType } = item
  const marketCreator = contract.creatorId === comment.userId
  const [hoveringChildContract, setHoveringChildContract] = useState(false)
  const commenterIsBettor = item.bet?.userUsername === comment.userUsername
  const creatorRepostsOwnComment = item.creatorId === comment.userId
  const showTopLevelRow = dataType === 'repost' && !commenterIsBettor && bet

  return (
    <Col
      className={clsx(
        'bg-canvas-0 group rounded-lg py-2 ',
        hoveringChildContract ? '' : 'hover:ring-[1px]'
      )}
    >
      <ClickFrame
        onClick={() => {
          router.push(`${contractPath(contract)}#${comment.id}`)
        }}
      >
        {showTopLevelRow && creatorRepostsOwnComment ? (
          <Row className="justify-between pr-2">
            <CommentReplyHeaderWithBet
              comment={comment}
              contract={contract}
              bet={bet}
            />
            <FeedDropdown
              contract={contract}
              item={item}
              interesting={true}
              toggleInteresting={hide}
              importanceScore={props.contract.importanceScore}
            />
          </Row>
        ) : (
          showTopLevelRow &&
          !creatorRepostsOwnComment && (
            <Col>
              <Row className={'mb-1 justify-end gap-2 pr-2'}>
                <CardReason item={item} contract={contract} />
                <FeedDropdown
                  contract={contract}
                  item={item}
                  interesting={true}
                  toggleInteresting={hide}
                  importanceScore={props.contract.importanceScore}
                />
              </Row>
              {!commenterIsBettor && (
                <CommentReplyHeaderWithBet
                  comment={comment}
                  contract={contract}
                  bet={bet}
                />
              )}
            </Col>
          )
        )}
        <Row className={'w-full gap-2'}>
          <Col className={'w-full pl-1 pr-2  transition-colors'}>
            <Row className="justify-between gap-2">
              <Row className="gap-2">
                <Avatar
                  username={userUsername}
                  size={'sm'}
                  avatarUrl={userAvatarUrl}
                  className={clsx(marketCreator && 'shadow shadow-amber-300')}
                />
                <Col className={''}>
                  <FeedCommentHeader
                    comment={comment}
                    contract={contract}
                    inTimeline={inTimeline}
                  />
                  <Content content={comment.content} />
                </Col>
              </Row>
              {(commenterIsBettor || !bet) && (
                <Row className={' justify-end gap-2'}>
                  <FeedDropdown
                    contract={contract}
                    item={item}
                    interesting={true}
                    toggleInteresting={hide}
                    importanceScore={props.contract.importanceScore}
                  />
                </Row>
              )}
            </Row>
            <Col
              className={'ml-6 mt-2'}
              onMouseEnter={() => setHoveringChildContract(true)}
              onMouseLeave={() => setHoveringChildContract(false)}
            >
              <FeedContractCard
                contract={contract}
                trackingPostfix="feed"
                item={item}
                className="border-ink-200 max-w-full border-[.1rem] pb-2 "
                hideBottomRow={true}
                size={'xs'}
                hideReason={true}
              />
            </Col>
            <Col>
              <BottomActionRow
                className={'ml-4'}
                contract={contract}
                user={user}
                comment={comment}
                privateUser={privateUser}
              />
            </Col>
          </Col>
        </Row>
      </ClickFrame>
    </Col>
  )
})

const BottomActionRow = (props: {
  contract: Contract
  comment: ContractComment
  user: User | null | undefined
  privateUser: PrivateUser | null | undefined
  className?: string
}) => {
  const { contract, className, comment, privateUser, user } = props

  return (
    <Row className={clsx('justify-between pt-2', 'pb-2', className)}>
      <BottomRowButtonWrapper>
        <TradesButton contract={contract} className={'h-full'} />
      </BottomRowButtonWrapper>

      {contract.outcomeType === 'BOUNTIED_QUESTION' && (
        <BottomRowButtonWrapper>
          <div className="text-ink-500 z-10 flex items-center gap-1.5 text-sm">
            <TbMoneybag className="h-6 w-6 stroke-2" />
            <div>
              {ENV_CONFIG.moneyMoniker}
              {shortFormatNumber(contract.bountyLeft)}
            </div>
          </div>
        </BottomRowButtonWrapper>
      )}

      {/* cpmm markets */}
      {'totalLiquidity' in contract && (
        <BottomRowButtonWrapper>
          <Button
            disabled={true}
            size={'2xs'}
            color={'gray-white'}
            className={'disabled:cursor-pointer'}
          >
            <Tooltip text={`Total liquidity`} placement="top" noTap>
              <Row
                className={'text-ink-500 h-full items-center gap-1.5 text-sm'}
              >
                <TbDropletHeart className="h-6 w-6 stroke-2" />
                <div>
                  {ENV_CONFIG.moneyMoniker}
                  {shortFormatNumber(contract.totalLiquidity)}
                </div>
              </Row>
            </Tooltip>
          </Button>
        </BottomRowButtonWrapper>
      )}

      <BottomRowButtonWrapper>
        <CommentsButton
          highlightCommentId={comment.id}
          contract={contract}
          user={user}
        />
      </BottomRowButtonWrapper>
      <BottomRowButtonWrapper>
        <LikeButton
          contentCreatorId={comment.userId}
          contentId={comment.id}
          user={user}
          contentType={'comment'}
          size={'xs'}
          contentText={richTextToString(comment.content)}
          disabled={isBlocked(privateUser, comment.userId)}
          trackingLocation={'feed'}
        />
      </BottomRowButtonWrapper>
    </Row>
  )
}
const BottomRowButtonWrapper = (props: { children: React.ReactNode }) => {
  return (
    <Row className="basis-10 justify-start whitespace-nowrap">
      {props.children}
    </Row>
  )
}
