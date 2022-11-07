import { CheckCircleIcon, PlusCircleIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { useFollows } from 'web/hooks/use-follows'
import { useUser } from 'web/hooks/use-user'
import { follow, unfollow } from 'web/lib/firebase/users'
import { withTracking } from 'web/lib/service/analytics'
import { Button } from './button'

export function FollowButton(props: {
  isFollowing: boolean | undefined
  onFollow: () => void
  onUnfollow: () => void
}) {
  const { isFollowing, onFollow, onUnfollow } = props

  const user = useUser()

  if (!user || isFollowing === undefined) return <></>

  if (isFollowing) {
    return (
      <Button
        size="sm"
        color="gray-outline"
        className="my-auto"
        onClick={withTracking(onUnfollow, 'unfollow')}
      >
        Following
      </Button>
    )
  }

  return (
    <Button
      size="sm"
      color="indigo"
      className="my-auto"
      onClick={withTracking(onFollow, 'follow')}
    >
      Follow
    </Button>
  )
}

export function UserFollowButton(props: { userId: string }) {
  const { userId } = props
  const user = useUser()
  const following = useFollows(user?.id)
  const isFollowing = following?.includes(userId)

  if (!user || user.id === userId) return null

  return (
    <FollowButton
      isFollowing={isFollowing}
      onFollow={() => follow(user.id, userId)}
      onUnfollow={() => unfollow(user.id, userId)}
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
        className={clsx('text-highlight-blue h-5 w-5 rounded-full bg-white')}
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
            'text-highlight-blue hover:text-hover-blue h-5 w-5 rounded-full bg-white'
          )}
          aria-hidden="true"
        />
      </button>
    </>
  )
}
