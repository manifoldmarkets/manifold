import { CheckCircleIcon, PlusCircleIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { useFollows } from 'web/hooks/use-follows'
import { useUser } from 'web/hooks/use-user'
import { follow, unfollow } from 'web/lib/firebase/users'
import { withTracking } from 'web/lib/service/analytics'
import { Button } from './button'
import { Col } from './layout/col'

export function FollowButton(props: {
  isFollowing: boolean | undefined
  onFollow: () => void
  onUnfollow: () => void
  small?: boolean
  className?: string
}) {
  const { isFollowing, onFollow, onUnfollow, small, className } = props

  const user = useUser()

  const smallStyle =
    'btn !btn-xs border-2 border-gray-500 bg-white normal-case text-gray-500 hover:border-gray-500 hover:bg-white hover:text-gray-500'

  if (!user || isFollowing === undefined)
    return (
      <button
        className={clsx('btn btn-sm invisible', small && smallStyle, className)}
      >
        Follow
      </button>
    )

  if (isFollowing) {
    return (
      <button
        className={clsx(
          'btn btn-outline btn-sm',
          small && smallStyle,
          className
        )}
        onClick={withTracking(onUnfollow, 'unfollow')}
      >
        Following
      </button>
    )
  }

  return (
    <button
      className={clsx('btn btn-sm', small && smallStyle, className)}
      onClick={withTracking(onFollow, 'follow')}
    >
      Follow
    </button>
  )
}

export function UserFollowButton(props: { userId: string; small?: boolean }) {
  const { userId, small } = props
  const currentUser = useUser()
  const following = useFollows(currentUser?.id)
  const isFollowing = following?.includes(userId)

  if (!currentUser || currentUser.id === userId) return null

  return (
    <FollowButton
      isFollowing={isFollowing}
      onFollow={() => follow(currentUser.id, userId)}
      onUnfollow={() => unfollow(currentUser.id, userId)}
      small={small}
    />
  )
}

export function MiniUserFollowButton(props: { userId: string }) {
  const { userId } = props
  const currentUser = useUser()
  const following = useFollows(currentUser?.id)
  const isFollowing = following?.includes(userId)
  const user = useUser()

  if (
    !currentUser ||
    currentUser.id === userId ||
    isFollowing ||
    !user ||
    isFollowing === undefined
  )
    return null
  return (
    <>
      <Button
        size="sm"
        color="highlight-blue"
        onClick={withTracking(() => follow(currentUser.id, userId), 'follow')}
      >
        <PlusCircleIcon
          className={clsx(
            'hover:text-hover-blue h-5 w-5 rounded-full bg-white sm:mr-2'
          )}
          aria-hidden="true"
        />
      </Button>
    </>
  )
}
