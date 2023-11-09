import { Col } from 'web/components/layout/col'
import { groupBy, orderBy } from 'lodash'
import { useRealtimeCommentsOnLover } from 'love/hooks/use-comments-on-lover'
import {
  LoverCommentInput,
  LoverProfileCommentThread,
} from 'love/components/lover-comments'
import { User } from 'common/user'
import { Row } from 'web/components/layout/row'
import ShortToggle from 'web/components/widgets/short-toggle'
import { useState } from 'react'
import { updateLover } from 'web/lib/firebase/love/api'
import { Tooltip } from 'web/components/widgets/tooltip'
import { toast } from 'react-hot-toast'
import { Subtitle } from './widgets/lover-subtitle'
import { Lover } from 'common/love/lover'

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
  const isCurrentUser = currentUser?.id === onUser.id
  return (
    <Col className={'mt-4 rounded py-2'}>
      <Row className={'mb-2 justify-between'}>
        <Subtitle>Endorsements</Subtitle>
        {isCurrentUser && (
          <Tooltip
            text={
              (lover.comments_enabled ? 'Disable' : 'Enable') +
              ' endorsements from others'
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
                      ? 'Enabling endorsements from others'
                      : 'Disabling endorsements from others',
                    success: on
                      ? 'Endorsements enabled from others'
                      : 'Endorsements disabled from others',
                    error: 'Failed to update endorsement status',
                  }
                )
              }}
            />
          </Tooltip>
        )}
      </Row>
      <div className="mb-4">
        {!lover.comments_enabled ? (
          <>This feature is disabled.</>
        ) : isCurrentUser ? (
          <>Other users can write endorsements of you here.</>
        ) : (
          <>
            If you know them, write something nice that adds to their profile.
          </>
        )}
      </div>
      {currentUser && !isCurrentUser && lover.comments_enabled && (
        <LoverCommentInput
          className="mb-4 mr-px mt-px"
          onUserId={onUser.id}
          trackingLocation={'contract page'}
        />
      )}
      {!lover.comments_enabled && currentUser?.id != lover.user_id && (
        <span className={'text-ink-500 text-sm'}>
          {onUser.name} has disabled endorsements from others.
        </span>
      )}
      {lover.comments_enabled &&
        orderBy(parentComments, 'createdTime', 'desc').map((c) => (
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
