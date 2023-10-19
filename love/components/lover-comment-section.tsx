import { Col } from 'web/components/layout/col'
import { groupBy, orderBy } from 'lodash'
import { useRealtimeCommentsOnLover } from 'love/hooks/use-comments-on-lover'
import {
  LoverCommentInput,
  LoverProfileCommentThread,
} from 'love/components/lover-comments'
import { useUser } from 'web/hooks/use-user'
import { User } from 'common/user'
import { Title } from 'web/components/widgets/title'

export const LoverCommentSection = (props: { onUser: User }) => {
  const { onUser } = props
  const comments = useRealtimeCommentsOnLover(onUser.id) ?? []
  const parentComments = comments.filter((c) => !c.replyToCommentId)
  const currentUser = useUser()
  const commentsByParent = groupBy(comments, (c) => c.replyToCommentId ?? '_')
  return (
    <Col className={'bg-canvas-0 mt-4 rounded-md p-2'}>
      <Title>Comments</Title>
      {currentUser && (
        <LoverCommentInput
          className="mb-4 mr-px mt-px"
          onUserId={onUser.id}
          trackingLocation={'contract page'}
        />
      )}
      {orderBy(parentComments, 'createdTime', 'desc').map((c) => (
        <LoverProfileCommentThread
          key={c.id + 'thread'}
          trackingLocation={onUser.name + 'comments  section'}
          threadComments={commentsByParent[c.id] ?? []}
          parentComment={c}
          onUser={onUser}
          showReplies={true}
          inTimeline={false}
        />
      ))}
    </Col>
  )
}
