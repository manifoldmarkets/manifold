import { HeartIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Reaction, ReactionContentTypes } from 'common/reaction'
import { User } from 'common/user'
import { memo, useEffect, useState } from 'react'
import { useLikesOnContent } from 'web/hooks/use-likes'
import useLongTouch from 'web/hooks/use-long-touch'
import { like, unLike } from 'web/lib/firebase/reactions'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { MultiUserList } from '../multi-user-transaction-link'
import { Avatar } from '../widgets/avatar'
import { Tooltip } from '../widgets/tooltip'
import { UserLink } from '../widgets/user-link'
import { Button, SizeType } from 'web/components/buttons/button'
import toast from 'react-hot-toast'
import { track } from '@amplitude/analytics-browser'

const LIKES_SHOWN = 3

export const LikeButton = memo(function LikeButton(props: {
  contentId: string
  contentCreatorId: string
  user: User | null | undefined
  contentType: ReactionContentTypes
  contentText: string
  trackingLocation: string
  className?: string
  placement?: 'top' | 'bottom'
  size?: SizeType
  disabled?: boolean
}) {
  const {
    user,
    contentType,
    contentCreatorId,
    contentId,
    contentText,
    className,
    trackingLocation,
    placement = 'bottom',
    size,
  } = props
  const likes = useLikesOnContent(contentType, contentId)
  const [liked, setLiked] = useState(false)
  useEffect(() => {
    if (likes) setLiked(likes.some((l) => l.user_id === user?.id))
  }, [likes, user])

  const totalLikes =
    (likes ? likes.filter((l) => l.user_id != user?.id).length : 0) +
    (liked ? 1 : 0)

  const disabled = props.disabled || !user
  const isMe = contentCreatorId === user?.id
  const [modalOpen, setModalOpen] = useState(false)

  const onLike = async (shouldLike: boolean) => {
    if (!user) return
    setLiked(shouldLike)
    if (shouldLike) {
      await like(contentId, contentType)

      track('like', {
        itemId: contentId,
        location: trackingLocation,
      })
    } else {
      await unLike(contentId, contentType)
    }
  }

  function handleLiked(liked: boolean) {
    onLike(liked)
  }

  const likeLongPress = useLongTouch(
    () => {
      setModalOpen(true)
    },
    () => {
      if (!disabled) {
        if (isMe) {
          toast("Of course you'd like yourself", { icon: '🙄' })
        } else {
          handleLiked(!liked)
        }
      }
    }
  )

  const otherLikes = liked ? totalLikes - 1 : totalLikes
  const showList = otherLikes > 0

  return (
    <>
      <Button
        color={'gray-white'}
        disabled={disabled}
        size={size}
        className={clsx(
          'text-ink-500 disabled:cursor-not-allowed',
          'disabled:text-ink-500',
          className
        )}
        {...likeLongPress}
      >
        <Tooltip
          text={
            showList ? (
              <UserLikedPopup
                contentType={contentType}
                contentId={contentId}
                onRequestModal={() => setModalOpen(true)}
                user={user}
                userLiked={liked}
              />
            ) : (
              'Like'
            )
          }
          placement={placement}
          noTap
          hasSafePolygon={showList}
        >
          <Row className={'items-center gap-1.5'}>
            <div className="relative">
              <HeartIcon
                className={clsx(
                  'h-6 w-6',
                  liked &&
                    'fill-scarlet-200 stroke-scarlet-300 dark:stroke-scarlet-600'
                )}
              />
            </div>
            {totalLikes > 0 && (
              <div className="text-ink-500 my-auto h-5  text-sm disabled:opacity-50">
                {totalLikes}
              </div>
            )}
          </Row>
        </Tooltip>
      </Button>
      {modalOpen && (
        <UserLikedFullList
          contentType={contentType}
          contentId={contentId}
          user={user}
          userLiked={liked}
          titleName={contentText}
        />
      )}
    </>
  )
})

function likeDisplayList(
  reacts: Reaction[] = [],
  self?: User | null,
  prependSelf?: boolean
) {
  const userIds = reacts.map((r) => r.user_id)

  return self && prependSelf
    ? [self.id, ...userIds.filter((id) => id !== self.id)]
    : userIds
}

function UserLikedFullList(props: {
  contentType: ReactionContentTypes
  contentId: string
  user?: User | null
  userLiked?: boolean
  titleName?: string
}) {
  const { contentType, contentId, titleName, user, userLiked } = props
  const reacts = useLikesOnContent(contentType, contentId)
  const userIds = likeDisplayList(reacts, user, userLiked)

  return (
    <MultiUserList
      users={userIds}
      modalLabel={
        <span>
          💖 Liked{' '}
          <span className="font-bold">
            {titleName
              ? titleName
              : contentType === 'contract'
              ? 'this question'
              : `this ${contentType}`}
          </span>
        </span>
      }
    />
  )
}

function UserLikedPopup(props: {
  contentType: ReactionContentTypes
  contentId: string
  onRequestModal: () => void
  user?: User | null
  userLiked?: boolean
}) {
  const { contentType, contentId, onRequestModal, user, userLiked } = props
  const reacts = useLikesOnContent(contentType, contentId)
  const userIds = likeDisplayList(reacts, user, userLiked)
  console.log(userIds)

  // only show "& n more" for n > 1
  const shown =
    userIds.length <= LIKES_SHOWN + 1 ? userIds : userIds.slice(0, LIKES_SHOWN)

  return (
    <Col className="min-w-[6rem] items-start">
      <div className="mb-1 font-bold">Like</div>
      {shown.map((id) => {
        return <UserLikedItem key={id} userId={id} />
      })}
      {userIds.length > shown.length && (
        <div
          className="text-primary-300 hover:text-primary-200 w-full cursor-pointer text-left"
          onClick={onRequestModal}
        >
          & {userIds.length - shown.length} more
        </div>
      )}
    </Col>
  )
}

function UserLikedItem(props: { userId: string }) {
  const { userId } = props
  return (
    <Row className="items-center gap-1.5">
      <Avatar userId={userId} size="2xs" />
      <UserLink userId={userId} short />
    </Row>
  )
}
