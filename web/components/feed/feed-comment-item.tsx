import { ContractComment } from 'common/comment'
import { Contract, contractPath } from 'common/contract'
import { FeedCommentThread, isReplyToBet } from './feed-comments'
import { Col } from '../layout/col'
import clsx from 'clsx'
import { Row } from '../layout/row'
import { FeedRelatedItemFrame } from './feed-timeline-items'

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
    // TODO: make more specific link
    <FeedRelatedItemFrame href={contractPath(contract)} className="-mt-3">
      <Col
        className={clsx(
          'mb-2 w-full',
          firstCommentIsReplyToBet ? 'sm:mt-4' : ''
      )}
      >
        {commentThreads.map((ct) => (
          <Row
            className={'relative w-full'}
            key={ct.parentComment.id + 'feed-thread'}
          >
            <Col className={'w-full'}>
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
