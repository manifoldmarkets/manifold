import { CheckCircleIcon, PlusCircleIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { useFollows } from 'web/hooks/use-follows'
import { isBlocked, usePrivateUser, useUser } from 'web/hooks/use-user'
import { follow, unfollow } from 'web/lib/firebase/users'
import { withTracking } from 'web/lib/service/analytics'
import { Button } from './button'

export function FollowButton(props: {
  isFollowing: boolean | undefined
  onFollow: () => void
  onUnfollow: () => void
  className?: string
}) {
  const { isFollowing, onFollow, onUnfollow, className } = props

  const user = useUser()

  if (!user || isFollowing === undefined) return <></>
  return (
    <Button
      size="sm"
      color={isFollowing ? 'dark-gray' : 'indigo'}
      className={clsx('my-auto', className)}
      onClick={withTracking(
        isFollowing ? onUnfollow : onFollow,
        isFollowing ? 'unfollow' : 'follow'
      )}
    >
      {isFollowing ? 'Following' : 'Follow'}
    </Button>
  )
}

export function UserFollowButton(props: {
  userId: string
  className?: string
}) {
  const { userId, className } = props
  const user = useUser()
  const following = useFollows(user?.id)
  const isFollowing = following?.includes(userId)
  const privateUser = usePrivateUser()
  if (!user || user.id === userId) return null
  if (isBlocked(privateUser, userId)) return <div />

  return (
    <FollowButton
      className={className}
      isFollowing={isFollowing}
      onFollow={() => follow(user.id, userId)}
      onUnfollow={() => unfollow(user.id, userId)}
    />
  )
}

export function MiniUserFollowButton(props: {
  userId: string
  className?: string
}) {
  const { userId, className } = props
  const user = useUser()
  const privateUser = usePrivateUser()
  const following = useFollows(user?.id)
  const isFollowing = following?.includes(userId)
  const isFirstRender = useRef(true)
  const [justFollowed, setJustFollowed] = useState(false)

  useEffect(() => {
    if (isFirstRender.current) {
      if (isFollowing != undefined) {
        isFirstRender.current = false
      }
      return
    }
    if (isFollowing) {
      setJustFollowed(true)
      setTimeout(() => {
        setJustFollowed(false)
      }, 1000)
    }
  }, [isFollowing])
  if (isBlocked(privateUser, userId)) return <div />

  if (justFollowed) {
    return (
      <CheckCircleIcon
        className={clsx(
          'text-highlight-blue bg-canvas-0 h-5 w-5 rounded-full',
          className
        )}
        aria-label="followed"
      />
    )
  }
  if (
    !user ||
    user.id === userId ||
    isFollowing ||
    !user ||
    isFollowing === undefined
  )
    return null
  return (
    <button
      onClick={withTracking(() => follow(user.id, userId), 'follow')}
      className={className}
      title="follow"
    >
      <PlusCircleIcon
        className={clsx(
          'text-highlight-blue hover:text-hover-blue bg-canvas-0 h-5 w-5 rounded-full'
        )}
        aria-hidden
      />
    </button>
  )
}
