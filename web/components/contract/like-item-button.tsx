import React, { useEffect, useMemo, useState } from 'react'
import { User } from 'common/user'
import { useUserLikes } from 'web/hooks/use-likes'
import { react, unReact } from 'web/lib/firebase/reactions'
import clsx from 'clsx'
import { HeartIcon } from '@heroicons/react/outline'
import { Contract } from 'common/contract'
import { debounce } from 'lodash'
import { ReactionContentTypes } from 'common/reaction'

export function LikeItemButton(props: {
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
  const likes = useUserLikes(user?.id)

  const userLikedItemIds = likes?.map((l) => l.id)
  const userLiked = userLikedItemIds?.includes(contentId)
  const disabled = !user || contentCreatorId === user?.id
  const [hover, setHover] = useState(false)
  const [liked, setLiked] = useState(false)
  const [totalLikes, setTotalLikes] = useState(props.totalLikes)
  const showRed = liked || (!liked && hover)

  const onLike = async (setLike: boolean) => {
    if (!user) return
    if (!setLike) return await unReact(user.id, contentId)

    await react(
      user,
      contentId,
      contentCreatorId,
      contentType,
      contract,
      contract.question,
      contentText
    )
  }

  const debouncedOnLike = useMemo(() => debounce(onLike, 1000), [])
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
    <div>
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
          <HeartIcon
            className={clsx(
              'h-5 w-5',
              showRed ? 'fill-red-700 stroke-red-700' : ''
            )}
          />
          <div
            className={clsx(
              'text-gray-500',
              'absolute -bottom-1 right-0 text-[0.5rem]'
            )}
          >
            {totalLikes > 0 ? totalLikes : ''}
          </div>
        </div>
      </button>
    </div>
  )
}
