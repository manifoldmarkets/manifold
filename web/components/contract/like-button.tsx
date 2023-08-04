import { HeartIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { Reaction, ReactionContentTypes, ReactionTypes } from 'common/reaction'
import { User } from 'common/user'
import { memo, useEffect, useState } from 'react'
import { useIsLiked, useLikesOnContent } from 'web/hooks/use-likes'
import useLongTouch from 'web/hooks/use-long-touch'
import { react, unReact } from 'web/lib/firebase/reactions'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import {
  MultiUserLinkInfo,
  MultiUserTransactionModal,
} from '../multi-user-transaction-link'
import { Avatar } from '../widgets/avatar'
import { Tooltip } from '../widgets/tooltip'
import { UserLink } from '../widgets/user-link'
import { LoadingIndicator } from '../widgets/loading-indicator'

const LIKES_SHOWN = 3

const ButtonReactionType = 'like' as ReactionTypes
export type LikeButtonSizeType = 'sm' | 'md' | 'xl'

export const LikeButton = memo(function LikeButton(props: {
  contentId: string
  contentCreatorId: string
  user: User | null | undefined
  contentType: ReactionContentTypes
  totalLikes: number
  contract: Contract
  contentText: string
  trackingLocation: string
  className?: string
  size?: LikeButtonSizeType
  color?: 'gray' | 'white'
  isSwipe?: boolean
  placement?: 'top' | 'bottom'
}) {
  const {
    user,
    contentType,
    contentCreatorId,
    contentId,
    contract,
    contentText,
    className,
    size = 'md',
    color = 'gray',
    isSwipe,
    trackingLocation,
    placement = 'bottom',
  } = props
  const userLiked = useIsLiked(user?.id, contentType, contentId)
  const disabled = !user || contentCreatorId === user?.id
  const [liked, setLiked] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [totalLikes, setTotalLikes] = useState(props.totalLikes)

  useEffect(() => {
    setTotalLikes(props.totalLikes)
  }, [props.totalLikes])

  const onLike = async (like: boolean) => {
    if (!user) return
    if (!like)
      return await unReact(user.id, contentId, contentType, ButtonReactionType)

    await react(
      user,
      contentId,
      contentCreatorId,
      contentType,
      contract,
      contract.question,
      contentText,
      ButtonReactionType,
      { isSwipe: !!isSwipe, location: trackingLocation }
    )
  }

  // Handle changes from our useLike hook
  useEffect(() => {
    setLiked(userLiked)
  }, [userLiked])

  function handleLiked(liked: boolean) {
    setLiked(liked)
    setTotalLikes((prev) => (liked ? prev + 1 : prev - 1))
    onLike(liked)
  }

  const likeLongPress = useLongTouch(
    () => {
      setModalOpen(true)
    },
    () => {
      if (!disabled) {
        handleLiked(!liked)
      }
    }
  )

  const otherLikes = liked ? totalLikes - 1 : totalLikes
  const showList = otherLikes > 0

  return (
    <>
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
        <button
          disabled={disabled}
          className={clsx(
            'flex flex-row items-center transition-transform disabled:cursor-not-allowed',
            color === 'white' ? 'text-ink-0' : 'text-ink-500 ',
            totalLikes === 0 &&
              !user &&
              color === 'gray' &&
              'disabled:opacity-50',
            !disabled && color === 'gray' ? 'hover:text-ink-600' : '',
            size === 'sm' && 'w-8 px-1',
            size === 'md' && ' px-2',
            size === 'xl' && ' px-4',
            className
          )}
          onClick={(e) => e.preventDefault()}
          {...likeLongPress}
        >
          <div className="relative">
            <HeartIcon
              className={clsx(
                size === 'sm' && 'h-4 w-4',
                size === 'md' && 'h-6 w-6',
                size === 'xl' && 'h-12 w-12',
                liked
                  ? 'fill-pink-400 stroke-pink-400'
                  : color === 'white' && 'fill-white stroke-white'
              )}
            />
          </div>
          {totalLikes > 0 && (
            <div
              className={clsx(
                ' my-auto h-5 pl-1 disabled:opacity-50',
                size === 'xl'
                  ? 'text-lg'
                  : size === 'sm'
                  ? 'mt-[6px] text-xs'
                  : 'text-sm',
                color === 'white' ? 'text-white' : 'text-ink-500'
              )}
            >
              {totalLikes}
            </div>
          )}
        </button>
      </Tooltip>
      {modalOpen && (
        <UserLikedFullList
          contentType={contentType}
          contentId={contentId}
          user={user}
          userLiked={liked}
          setOpen={setModalOpen}
          titleName={contentText}
        />
      )}
    </>
  )
})

function getLikeDisplayList(
  reacts: Reaction[],
  self?: User | null,
  prependSelf?: boolean
) {
  const likedUserInfos = reacts.map((reaction) => {
    return {
      name: reaction.userDisplayName,
      username: reaction.userUsername,
      avatarUrl: reaction.userAvatarUrl,
    } as MultiUserLinkInfo
  })

  let displayInfos = likedUserInfos
  if (self) {
    displayInfos = likedUserInfos.filter((u) => u.username !== self.username)
    if (prependSelf) {
      displayInfos = [self, ...displayInfos]
    }
  }
  return displayInfos
}

function UserLikedFullList(props: {
  contentType: ReactionContentTypes
  contentId: string
  user?: User | null
  userLiked?: boolean
  setOpen: (isOpen: boolean) => void
  titleName?: string
}) {
  const { contentType, contentId, user, userLiked, setOpen, titleName } = props
  const reacts = useLikesOnContent(contentType, contentId)
  const displayInfos = reacts
    ? getLikeDisplayList(reacts, user, userLiked)
    : null

  return (
    <MultiUserTransactionModal
      userInfos={displayInfos}
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
      open={true}
      setOpen={setOpen}
      short={true}
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
  const displayInfos = reacts
    ? getLikeDisplayList(reacts, user, userLiked)
    : null

  if (displayInfos == null) {
    return (
      <Col className="min-w-[6rem] items-start">
        <div className="mb-1 font-bold">Like</div>
        <LoadingIndicator className="mx-auto my-2" size="sm" />
      </Col>
    )
  }

  // only show "& n more" for n > 1
  const shown =
    displayInfos.length <= LIKES_SHOWN + 1
      ? displayInfos
      : displayInfos.slice(0, LIKES_SHOWN)

  return (
    <Col className="min-w-[6rem] items-start">
      <div className="mb-1 font-bold">Like</div>
      {shown.map((u, i) => {
        return <UserLikedItem key={i} userInfo={u} />
      })}
      {displayInfos.length > shown.length && (
        <div
          className="text-primary-300 hover:text-primary-200 w-full cursor-pointer text-left"
          onClick={onRequestModal}
        >
          & {displayInfos.length - shown.length} more
        </div>
      )}
    </Col>
  )
}

function UserLikedItem(props: { userInfo: MultiUserLinkInfo }) {
  const { userInfo } = props
  return (
    <Row className="items-center gap-1.5">
      <Avatar
        username={userInfo.username}
        avatarUrl={userInfo.avatarUrl}
        size="2xs"
      />
      <UserLink
        name={userInfo.name}
        username={userInfo.username}
        short={true}
      />
    </Row>
  )
}
