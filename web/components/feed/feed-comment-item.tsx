import { ContractComment } from 'common/comment'
import { Contract, contractPath } from 'common/contract'
import { FeedCommentThread, isReplyToBet } from './feed-comments'
import { Col } from '../layout/col'
import clsx from 'clsx'
import { ClickFrame } from '../widgets/click-frame'
import { useRouter } from 'next/router'

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

  const router = useRouter()

  return (
    <div>
      <Col
        className={clsx(
          'mb-2 w-full',
          firstCommentIsReplyToBet ? 'sm:mt-4' : ''
        )}
      >
        {commentThreads.map((ct) => (
          <ClickFrame
            onClick={() => {
              router.push(`${contractPath(contract)}#${ct.parentComment.id}`)
            }}
            key={ct.parentComment.id + 'feed-thread'}
          >
            <FeedCommentThread
              contract={contract}
              threadComments={ct.childComments}
              parentComment={ct.parentComment}
              collapseMiddle={true}
              trackingLocation={'feed'}
              inTimeline={true}
            />
          </ClickFrame>
        ))}
      </Col>
    </div>
  )
}
