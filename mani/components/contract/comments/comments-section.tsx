import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { MINUTE_MS } from 'common/util/time'
import { Col } from 'components/layout/col'
import { ThemedText } from 'components/themed-text'
import { groupBy, sortBy, uniqBy } from 'lodash'
import { useState } from 'react'
import { ParentComment } from './parent-comment'
import { useColor } from 'hooks/use-color'
import { useAPIGetter } from 'hooks/use-api-getter'
import { useSubscribeNewComments } from 'client-common/hooks/use-comments'
// TODO: pinned comments
// TODO: jump to comments
// TODO: loadingMore logic
export function CommentsSection(props: {
  contract: Contract
  comments: ContractComment[]
  pinnedComments: ContractComment[]
}) {
  const { contract } = props
  const { data: allComments } = useAPIGetter(
    'comments',
    {
      contractId: contract.id,
    },
    undefined,
    'comments-' + contract.id
  )

  // Listen for new comments
  const newComments = useSubscribeNewComments(contract.id)
  const comments = uniqBy(
    [...(newComments ?? []), ...(props.comments ?? [])],
    'id'
  )

  const isReply = (c: ContractComment) => c.replyToCommentId !== undefined

  const sorts = ['Newest', 'Best']

  const [sortIndex, setSortIndex] = useState(0)

  const sort = sorts[sortIndex]
  const color = useColor()

  const sortedComments = sortBy(comments, [
    sort === 'Best'
      ? (c) =>
          isReply(c as ContractComment)
            ? c.createdTime
            : // For your own recent comments, show first.
            c.createdTime > Date.now() - 10 * MINUTE_MS
            ? // TODO: add back && c.userId === user?.id
              -Infinity
            : c.hidden
            ? Infinity
            : -((c.likes ?? 0) - (c.dislikes ?? 0))
      : // Newest
        (c) => c,
    (c) =>
      isReply(c as ContractComment)
        ? c.createdTime
        : c.hidden
        ? Infinity
        : -c.createdTime,
  ])

  const commentsByParent = groupBy(
    sortedComments,
    (c) => c.replyToCommentId ?? '_'
  )

  const parentComments = sortedComments.filter(
    (c) => c.replyToCommentId === undefined
  )
  // TODO: add reply input
  return (
    <Col>
      <ThemedText size="xl" weight="semibold" style={{ paddingVertical: 12 }}>
        Comments
      </ThemedText>

      {parentComments.length > 0 ? (
        parentComments.map((parent) => (
          <ParentComment
            key={parent.id}
            parentComment={parent as ContractComment}
            threadComments={
              (commentsByParent[parent.id] as ContractComment[]) ?? []
            }
          />
          // TODO: render more comments as the user scrolls down
        ))
      ) : (
        <ThemedText size="md" color={color.textTertiary}>
          No comments yet.
        </ThemedText>
      )}
    </Col>
  )
}
