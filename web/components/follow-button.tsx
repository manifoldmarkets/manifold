import { CheckCircleIcon, PlusCircleIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { useFollows } from 'web/hooks/use-follows'
import { useUser } from 'web/hooks/use-user'
import { follow, unfollow } from 'web/lib/firebase/users'
import { withTracking } from 'web/lib/service/analytics'

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
  const user = useUser()
  const following = useFollows(user?.id)
  const isFollowing = following?.includes(userId)

  if (!user || user.id === userId) return null

  return (
    <FollowButton
      isFollowing={isFollowing}
      onFollow={() => follow(user.id, userId)}
      onUnfollow={() => unfollow(user.id, userId)}
      small={small}
    />
  )
}

export function MiniUserFollowButton(props: { userId: string }) {
  const { userId } = props
  const user = useUser()
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

  if (justFollowed) {
    return (
      <CheckCircleIcon
        className={clsx(
          'text-highlight-blue ml-3 mt-2 h-5 w-5 rounded-full bg-white sm:mr-2'
        )}
        aria-hidden="true"
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
    <>
      <button onClick={withTracking(() => follow(user.id, userId), 'follow')}>
        <PlusCircleIcon
          className={clsx(
            'text-highlight-blue hover:text-hover-blue mt-2 ml-3 h-5 w-5 rounded-full bg-white sm:mr-2'
          )}
          aria-hidden="true"
        />
      </button>
    </>
  )
}
