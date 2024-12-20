import { ContractComment } from 'common/comment'
import { Col } from 'components/layout/col'
import { useEvent } from 'hooks/useEvent'
import { useState } from 'react'
import { ParentComment } from './ParentComment'
import { Comment } from './Comment'
export function CommentThread({
  parentComment,
  threadComments,
}: {
  parentComment: ContractComment
  threadComments: ContractComment[]
}) {
  const [seeReplies, setSeeReplies] = useState(false)
  const onSeeRepliesClick = useEvent(() => setSeeReplies(!seeReplies))

  return (
    <Col>
      <ParentComment
        comment={parentComment}
        seeReplies={seeReplies}
        // numReplies={threadComment.length}
        numReplies={0}
      />
      {seeReplies &&
        threadComments.map((comment) => (
          <Comment key={comment.id} comment={comment} />
        ))}
    </Col>
  )
}
