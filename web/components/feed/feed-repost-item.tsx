import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { CommentReplyHeader, FeedCommentHeader } from './feed-comments'
import { Col } from '../layout/col'
import clsx from 'clsx'
import { memo } from 'react'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { CardReason } from 'web/components/feed/card-reason'
import { FeedDropdown } from 'web/components/feed/card-dropdown'
import { FeedTimelineItem } from 'web/hooks/use-feed-timeline'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { Content } from 'web/components/widgets/editor'

export const FeedRepost = memo(function (props: {
  contract: Contract
  comment: ContractComment
  item: FeedTimelineItem
  trackingLocation: string
  hide: () => void
  onReplyClick?: (comment: ContractComment) => void
  inTimeline?: boolean
}) {
  const { contract, item, hide, inTimeline, comment } = props

  const { userUsername, userAvatarUrl } = comment
  const marketCreator = contract.creatorId === comment.userId

  return (
    <Col className="bg-canvas-0 group rounded-lg py-2">
      <CommentReplyHeader comment={comment} contract={contract} />
      <Row className={'w-full gap-2'}>
        <Col className={'w-full px-3  transition-colors'}>
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
            <Col className="gap-1">
              <CardReason item={item} contract={contract} />
              <FeedDropdown
                contract={contract}
                item={item}
                interesting={true}
                toggleInteresting={hide}
                importanceScore={props.contract.importanceScore}
              />
            </Col>
          </Row>
          <Col className={' ml-4 mt-2'}>
            <FeedContractCard
              contract={contract}
              trackingPostfix="feed"
              item={item}
              className="!bg-canvas-0 border-ink-200 max-w-full"
              small={true}
            />
          </Col>
          {/*Not sure how to add these, yet*/}
          {/*<Row>*/}
          {/*  <CommentActions*/}
          {/*    onReplyClick={onReplyClick}*/}
          {/*    comment={comment}*/}
          {/*    contract={contract}*/}
          {/*    trackingLocation={trackingLocation}*/}
          {/*  />*/}
          {/*</Row>*/}
        </Col>
      </Row>
    </Col>
  )
})
