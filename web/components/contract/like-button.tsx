import { HeartIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { ReactionContentTypes, ReactionTypes } from 'common/reaction'
import { User } from 'common/user'
import { debounce, partition } from 'lodash'
import { memo, useEffect, useMemo, useState } from 'react'
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

const LIKES_SHOWN = 3

const ButtonReactionType = 'like' as ReactionTypes
export type LikeButtonSizeType = 'md' | 'lg' | 'xl'

export const LikeButton = memo(function LikeButton(props: {
  contentId: string
  contentCreatorId: string
  user: User | null | undefined
  contentType: ReactionContentTypes
  totalLikes: number
  contract: Contract
  contentText: string
  className?: string
  size?: LikeButtonSizeType
  showTotalLikesUnder?: boolean
  color?: 'gray' | 'white'
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
    showTotalLikesUnder,
    color = 'gray',
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
      ButtonReactionType
    )
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedOnLike = useMemo(() => debounce(onLike, 1000), [user])

  // Handle changes from our useLike hook
  useEffect(() => {
    setLiked(userLiked)
  }, [userLiked])

  useEffect(() => {
    return () => debouncedOnLike.cancel()
  }, [debouncedOnLike])

  function handleLiked(liked: boolean) {
    setLiked(liked)
    setTotalLikes((prev) => (liked ? prev + 1 : prev - 1))
    debouncedOnLike(liked)
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

  const likedUsers = useLikesOnContent(contentType, contentId)
  const likedUserInfo = likedUsers
    ? likedUsers.map((reaction) => {
        return {
          name: reaction.userDisplayName,
          username: reaction.userUsername,
          avatarUrl: reaction.userAvatarUrl,
        } as MultiUserLinkInfo
      })
    : undefined

  const hasSafePolygon =
    (likedUserInfo != undefined && likedUserInfo.length > 0) || userLiked
  return (
    <Row
      className={clsx(
        'relative items-center',
        size === 'md' && 'mx-2',
        size === 'xl' && 'mx-4',
        className
      )}
    >
      <Tooltip
        text={
          <UserLikedList
            likedUserInfo={likedUserInfo}
            setModalOpen={() => setModalOpen(true)}
            user={user}
            userLiked={userLiked}
          />
        }
        placement={'bottom'}
        noTap
        hasSafePolygon={hasSafePolygon}
        className={'flex items-center'}
      >
        <button
          disabled={disabled}
          className={clsx(
            'transition-transform disabled:cursor-not-allowed',
            color === 'white'
              ? 'text-white disabled:opacity-50'
              : 'text-gray-500',
            !disabled && color === 'gray' ? 'hover:text-gray-600' : ''
          )}
          {...likeLongPress}
        >
          <div className="relative">
            {!showTotalLikesUnder && (
              <div
                className={clsx(
                  totalLikes > 0 ? 'bg-gray-500' : '',
                  'absolute rounded-full text-center text-white',
                  size === 'md' &&
                    '-bottom-1.5 -right-1.5 min-w-[15px] p-[1.5px] text-[10px] leading-3',
                  size === 'xl' && 'bottom-0 right-0 min-w-[24px] p-0.5 text-sm'
                )}
              >
                {totalLikes > 0 ? totalLikes : ''}
              </div>
            )}
            <HeartIcon
              className={clsx(
                size === 'md' && 'h-5 w-5',
                size === 'lg' && 'h-8 w-8',
                size === 'xl' && 'h-12 w-12',
                liked ? 'fill-pink-400 stroke-pink-400' : ''
              )}
            />
          </div>
        </button>
      </Tooltip>
      {likedUserInfo && (
        <MultiUserTransactionModal
          userInfos={likedUserInfo}
          modalLabel={`💖 Liked this ${
            contentType === 'contract' ? 'market' : contentType
          }`}
          open={modalOpen}
          setOpen={setModalOpen}
          short={true}
        />
      )}
      {showTotalLikesUnder && (
        <div
          className={clsx(
            size === 'xl' ? '-mt-3 text-lg' : '-mt-1.5 text-xs',
            'mx-auto h-6 text-white disabled:opacity-50'
          )}
        >
          {totalLikes > 0 ? totalLikes : ''}
        </div>
      )}
    </Row>
  )
})

function UserLikedList(props: {
  likedUserInfo: MultiUserLinkInfo[] | undefined
  setModalOpen: () => void
  user?: User | null
  userLiked?: boolean
}) {
  const { likedUserInfo, user, setModalOpen, userLiked } = props
  const length = likedUserInfo?.length
  if (!likedUserInfo || !length || length <= 0) {
    return <div className="cursor-default">Like</div>
  }
  let userInfo = likedUserInfo
  if (userLiked && user) {
    const [youLiked, otherUsersLiked] = partition(
      likedUserInfo,
      (u) => u.username === user?.username
    )
    userInfo = youLiked.concat(otherUsersLiked)
  }

  // only show "& n more" for n > 1
  const shown =
    userInfo.length <= LIKES_SHOWN + 1 ? userInfo : userInfo.slice(0, 3)

  return (
    <Col className="min-w-24 items-start">
      <div className="mb-1 font-bold">Like</div>
      {shown.map((u) => {
        return (
          <UserLikedItem key={u.avatarUrl + u.username + u.name} userInfo={u} />
        )
      })}
      {userInfo.length > shown.length && (
        <div
          className="w-full cursor-pointer text-left text-indigo-300 hover:text-indigo-200"
          onClick={setModalOpen}
        >
          & {userInfo.length - shown.length} more
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
        size="xxs"
      />
      <UserLink
        name={userInfo.name}
        username={userInfo.username}
        short={true}
      />
    </Row>
  )
}
