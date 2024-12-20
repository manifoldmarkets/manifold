import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { MINUTE_MS } from 'common/util/time'
import { Col } from 'components/layout/col'
import { ThemedText } from 'components/themed-text'
import { EXAMPLE_COMMENTS } from 'constants/examples/example-comments'
import { groupBy, keyBy, sortBy } from 'lodash'
import { useState } from 'react'
import { ParentComment } from './parent-comment'

// TODO: pinned comments
// TODO: jump to comments
// TODO: loadingMore logic
export function CommentsSection({ contract }: { contract: Contract }) {
  // TODO: actually grab comments
  const comments = EXAMPLE_COMMENTS

  const isReply = (c: ContractComment) => c.replyToCommentId !== undefined

  const sorts = ['Newest', 'Best']

  const [sortIndex, setSortIndex] = useState(0)

  const sort = sorts[sortIndex]

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

  const commentById = keyBy(comments, 'id')

  const parentComments = sortedComments.filter(
    (c) => c.replyToCommentId === undefined
  )
  // TODO: add reply input
  return (
    <Col style={{ gap: 16 }}>
      <ThemedText size="xl" weight="semibold">
        Comments
      </ThemedText>

      {parentComments.map((parent) => (
        <ParentComment
          key={parent.id}
          parentComment={parent as ContractComment}
          threadComments={
            (commentsByParent[parent.id] as ContractComment[]) ?? []
          }
        />
      ))}
    </Col>
  )
}
