import { Col } from 'web/components/layout/col'
import { groupBy, orderBy } from 'lodash'
import { useRealtimeCommentsOnLover } from 'love/hooks/use-comments-on-lover'
import {
  LoverCommentInput,
  LoverProfileCommentThread,
} from 'love/components/lover-comments'
import { User } from 'common/user'
import { Title } from 'web/components/widgets/title'
import { Row } from 'web/components/layout/row'
import ShortToggle from 'web/components/widgets/short-toggle'
import { Lover } from 'love/hooks/use-lover'
import { useState } from 'react'
import { updateLover } from 'web/lib/firebase/love/api'
import { Tooltip } from 'web/components/widgets/tooltip'
import { toast } from 'react-hot-toast'
import { Subtitle } from './widgets/lover-subtitle'

export const LoverCommentSection = (props: {
  onUser: User
  lover: Lover
  currentUser: User | null | undefined
}) => {
  const { onUser, currentUser } = props
  const comments = useRealtimeCommentsOnLover(onUser.id) ?? []
  const parentComments = comments.filter((c) => !c.replyToCommentId)
  const commentsByParent = groupBy(comments, (c) => c.replyToCommentId ?? '_')
  const [lover, setLover] = useState<Lover>(props.lover)
  return (
    <Col className={'mt-4 rounded py-2'}>
      <Row className={' mb-4 justify-between'}>
        <Subtitle>Comments</Subtitle>
        {currentUser?.id === lover.user_id && (
          <Tooltip
            text={
              (lover.comments_enabled ? 'Disable' : 'Enable') +
              ' comments from others'
            }
          >
            <ShortToggle
              on={lover.comments_enabled}
              setOn={(on) => {
                const update = { ...lover, comments_enabled: on }
                setLover(update)
                toast.promise(
                  updateLover({
                    ...update,
                  }),
                  {
                    loading: on
                      ? 'Enabling comments from others'
                      : 'Disabling comments from others',
                    success: on
                      ? 'Comments enabled from others'
                      : 'Comments disabled from others',
                    error: 'Failed to update comment status',
                  }
                )
              }}
            />
          </Tooltip>
        )}
      </Row>
      {currentUser &&
        (lover.comments_enabled ||
          (!lover.comments_enabled && currentUser.id === lover.user_id)) && (
          <LoverCommentInput
            className="mb-4 mr-px mt-px"
            onUserId={onUser.id}
            trackingLocation={'contract page'}
          />
        )}
      {!lover.comments_enabled && currentUser?.id != lover.user_id && (
        <span className={'text-ink-500 text-sm'}>
          {onUser.name} has disabled comments from others.
        </span>
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
