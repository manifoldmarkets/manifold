import React, { useState } from 'react'
import { User } from 'common/user'
import { useUserLikes } from 'web/hooks/use-likes'
import { react, unReact } from 'web/lib/firebase/reactions'
import { firebaseLogin } from 'web/lib/firebase/users'
import clsx from 'clsx'
import { HeartIcon } from '@heroicons/react/outline'
import { Contract } from 'common/contract'

export function LikeItemButton(props: {
  itemId: string
  itemCreatorId: string
  user: User | null | undefined
  itemType: string
  totalLikes: number
  contract: Contract
}) {
  const { user, itemType, itemCreatorId, itemId, totalLikes, contract } = props

  const disabled = !user || itemCreatorId === user?.id
  const [hover, setHover] = useState(false)
  // const [liked, setLiked] = useState(false)
  const likes = useUserLikes(user?.id)

  const userLikedItemIds = likes?.map((l) => l.id)
  const userLiked = userLikedItemIds?.includes(itemId)

  const onLike = async () => {
    if (!user) return firebaseLogin()
    if (userLiked) return await unReact(user.id, itemId)

    await react(
      user,
      itemId,
      itemCreatorId,
      itemType,
      contract,
      contract.question
    )
  }

  return (
    <button
      onClick={onLike}
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
      <div className="relative m-px">
        <div className={clsx(hover ? 'bg-red-300' : '')}>
          <HeartIcon className="h-4 w-4" />
          <div
            className={clsx(
              userLiked && 'text-indigo-600',
              'absolute top-0.5 text-[0.5rem]'
            )}
          >
            {totalLikes > 0 ? totalLikes : ''}
          </div>
        </div>
      </div>
    </button>
  )
}
