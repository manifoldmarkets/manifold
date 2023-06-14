import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { FeedCommentThread, isReplyToBet } from './feed-comments'
import { Col } from '../layout/col'
import clsx from 'clsx'
import { Row } from '../layout/row'
import { FeedRelatedItemFrame } from './feed-timeline-items'
import { getCommentLink } from './copy-link-date-time'

export const FeedCommentItem = (props: {
  contract: Contract
  commentThreads: {
    parentComment: ContractComment
    childComments: ContractComment[]
  }[]
}) => {
  const { contract, commentThreads } = props
  const firstCommentIsReplyToBet =
    commentThreads[0] && isReplyToBet(commentThreads[0].parentComment)
  return (
    <FeedRelatedItemFrame href={`${contract.creatorUsername}/${contract.slug}`}>
      <Col
        className={clsx('w-full', firstCommentIsReplyToBet ? 'sm:mt-4' : '')}
      >
        {commentThreads.map((ct, index) => (
          <Row
            className={'relative w-full'}
            key={ct.parentComment.id + 'feed-thread'}
          >
            <Col className={'w-full p-3'}>
              <FeedCommentThread
                contract={contract}
                threadComments={ct.childComments}
                parentComment={ct.parentComment}
                collapseMiddle={true}
                trackingLocation={'feed'}
                inTimeline={true}
              />
            </Col>
          </Row>
        ))}
      </Col>
    </FeedRelatedItemFrame>
  )
}
