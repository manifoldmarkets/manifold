import React, { memo, useEffect, useMemo, useState } from 'react'
import { User } from 'common/user'
import { useIsLiked } from 'web/hooks/use-likes'
import { react, unReact } from 'web/lib/firebase/reactions'
import clsx from 'clsx'
import { HeartIcon } from '@heroicons/react/outline'
import { Contract } from 'common/contract'
import { debounce } from 'lodash'
import { ReactionContentTypes, ReactionTypes } from 'common/reaction'
import { Tooltip } from 'web/components/widgets/tooltip'

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
  const [hover, setHover] = useState(false)
  const [liked, setLiked] = useState(false)
  const showRed = liked || (!liked && hover)
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
    setLiked(userLiked ?? false)
  }, [userLiked])

  useEffect(() => {
    return () => debouncedOnLike.cancel()
  }, [debouncedOnLike])

  function handleLiked(liked: boolean) {
    setLiked(liked)
    setTotalLikes((prev) => (liked ? prev + 1 : prev - 1))
    debouncedOnLike(liked)
  }

  return (
    <Tooltip
      text={userLiked ? 'Unlike' : 'Like'}
      placement="bottom"
      noTap
      noFade
    >
      {' '}
      <button
        onClick={() => handleLiked(!liked)}
        disabled={disabled}
        className={clsx(
          'px-2 py-1 text-xs', //2xs button
          'text-gray-500 transition-transform disabled:cursor-not-allowed',
          !disabled ? 'hover:text-gray-600' : ''
        )}
        onMouseOver={() => {
          if (!disabled) {
            setHover(true)
          }
        }}
        onMouseLeave={() => setHover(false)}
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
              showRed ? 'fill-red-400 stroke-red-400' : ''
            )}
          />
        </div>
      </button>
    </Tooltip>
  )
})
