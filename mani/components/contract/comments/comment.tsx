import { ContractComment } from 'common/comment'
import { ContentRenderer } from 'components/content/content-renderer'
import { Col } from 'components/layout/col'
import { Row } from 'components/layout/row'
import { ThemedText } from 'components/themed-text'
import { ReactNode } from 'react'
import { TouchableOpacity } from 'react-native'
import { fromNow } from 'util/time'
import { IconSymbol } from 'components/ui/icon-symbol'
import { useColor } from 'hooks/use-color'
import { AvatarCircle } from 'components/user/avatar-circle'
import { Reaction, ReactionType } from 'common/reaction'
import { ReactionContentTypes } from 'common/reaction'
import { api } from 'lib/api'
import { queryHandlers } from 'lib/batch-query-handlers'
import { useBatchedGetter } from 'client-common/hooks/use-batched-getter'
import { useEffect, useState } from 'react'

const useReactionsOnContent = (
  contentType: ReactionContentTypes,
  contentId: string
) => {
  const [reactions] = useBatchedGetter<Reaction[] | undefined>(
    queryHandlers,
    `${contentType}-reactions`,
    contentId,
    undefined
  )

  return reactions
}

const unreact = async (
  contentId: string,
  contentType: ReactionContentTypes,
  reactionType: ReactionType
) => {
  api('react', {
    remove: true,
    contentId,
    contentType,
    reactionType,
  })
}

const react = async (
  contentId: string,
  contentType: ReactionContentTypes,
  reactionType: ReactionType
) => {
  api('react', {
    remove: false,
    contentId,
    contentType,
    reactionType,
  })
}

export function Comment({
  comment,
  line,
  replyButton,
}: {
  comment: ContractComment
  isParent?: boolean
  line?: boolean
  replyButton?: ReactNode
}) {
  const { userUsername, userAvatarUrl, userId } = comment
  const color = useColor()
  const allReactions = useReactionsOnContent('comment', comment.id)
  const reactionsContainMyLike = allReactions?.some(
    (r) => r.user_id === userId && r.reaction_type === 'like'
  )
  const reactionsContainMyDislike = allReactions?.some(
    (r) => r.user_id === userId && r.reaction_type === 'dislike'
  )
  const [hasLiked, setHasLiked] = useState(false)
  const [hasDisliked, setHasDisliked] = useState(false)

  useEffect(() => {
    if (allReactions) {
      const userReaction = allReactions.find(
        (r: Reaction) => r.user_id === userId
      )
      setHasLiked(userReaction?.reaction_type === 'like')
      setHasDisliked(userReaction?.reaction_type === 'dislike')
    }
  }, [allReactions, userId])

  const likeCount =
    (allReactions?.filter((r) => r.reaction_type === 'like').length ?? 0) +
    (hasLiked && !reactionsContainMyLike ? 1 : 0)
  const dislikeCount =
    (allReactions?.filter((r) => r.reaction_type === 'dislike').length ?? 0) +
    (hasDisliked && !reactionsContainMyDislike ? 1 : 0)

  const handleLike = async () => {
    if (hasDisliked) {
      setHasDisliked(false)
      await unreact(comment.id, 'comment', 'dislike')
    }
    const newLikeState = !hasLiked
    setHasLiked(newLikeState)
    if (newLikeState) {
      await react(comment.id, 'comment', 'like')
    } else {
      await unreact(comment.id, 'comment', 'like')
    }
  }

  const handleDislike = async () => {
    if (hasLiked) {
      setHasLiked(false)
      await unreact(comment.id, 'comment', 'like')
    }
    const newDislikeState = !hasDisliked
    setHasDisliked(newDislikeState)
    if (newDislikeState) {
      await react(comment.id, 'comment', 'dislike')
    } else {
      await unreact(comment.id, 'comment', 'dislike')
    }
  }

  return (
    <Col style={{ width: '100%' }}>
      <Row style={{ gap: 8, flexShrink: 1 }}>
        <Col style={{ width: 24, alignItems: 'center' }}>
          {line && (
            <Col
              style={{
                width: 1,
                flex: 1,
                backgroundColor: color.borderSecondary,
                position: 'absolute',
                top: 0,
                bottom: 0,
              }}
            />
          )}
          <AvatarCircle avatarUrl={userAvatarUrl} username={userUsername} />
        </Col>
        <Col style={{ flexShrink: 1, flex: 1, gap: 4 }}>
          <Row
            style={{
              gap: 8,
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <ThemedText size="md" color={color.textTertiary}>
              {userUsername}
            </ThemedText>
            <ThemedText size="sm" color={color.textQuaternary}>
              {fromNow(comment.createdTime, true)}
            </ThemedText>
          </Row>

          <ContentRenderer content={comment.content} />
          <Row
            style={{
              width: '100%',
              justifyContent: replyButton ? 'space-between' : 'flex-end',
              alignItems: 'center',
              paddingBottom: 16,
            }}
          >
            {replyButton}

            <Row style={{ gap: 16 }}>
              <TouchableOpacity onPress={handleLike}>
                <ThemedText size="md" color={color.textTertiary}>
                  <IconSymbol
                    name="hand.thumbsup"
                    size={16}
                    color={hasLiked ? color.primary : color.textTertiary}
                  />
                  {likeCount > 0 && ` ${likeCount}`}
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDislike}>
                <ThemedText size="md" color={color.textTertiary}>
                  <IconSymbol
                    name="hand.thumbsdown"
                    size={16}
                    color={hasDisliked ? color.error : color.textTertiary}
                  />
                  {dislikeCount > 0 && ` ${dislikeCount}`}
                </ThemedText>
              </TouchableOpacity>
            </Row>
          </Row>
        </Col>
      </Row>
    </Col>
  )
}
