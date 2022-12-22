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
export const LIKES_SHOWN = 3

const ButtonReactionType = 'like' as ReactionTypes
export const LikeButton = memo(function LikeButton(props: {
  contentId: string
  contentCreatorId: string
  user: User | null | undefined
  contentType: ReactionContentTypes
  totalLikes: number
  contract: Contract
  contentText: string
}) {
  const {
    user,
    contentType,
    contentCreatorId,
    contentId,
    contract,
    contentText,
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

  return (
    <>
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
      >
        <button
          disabled={disabled}
          className={clsx(
            'my-auto px-2 py-1 text-xs', //2xs button
            'text-gray-500 transition-transform disabled:cursor-not-allowed',
            !disabled ? 'hover:text-gray-600' : ''
          )}
          {...likeLongPress}
        >
          <div className="relative">
            <div
              className={clsx(
                totalLikes > 0 ? 'bg-gray-500' : '',
                ' absolute -bottom-1.5 -right-1.5 min-w-[15px] rounded-full p-[1.5px] text-center text-[10px] leading-3 text-white'
              )}
            >
              {totalLikes > 0 ? totalLikes : ''}
            </div>
            <HeartIcon
              className={clsx(
                'h-5 w-5',
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
    </>
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
  return (
    <Col className="min-w-24 items-start">
      <div className="mb-1 font-bold">Like</div>
      {userInfo.slice(0, LIKES_SHOWN).map((u) => {
        return (
          <UserLikedItem key={u.avatarUrl + u.username + u.name} userInfo={u} />
        )
      })}
      {length > LIKES_SHOWN && (
        <div
          className="w-full cursor-pointer text-left text-indigo-300 hover:text-indigo-200"
          onClick={setModalOpen}
        >
          & {length - LIKES_SHOWN} more
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
