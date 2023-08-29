import { useIsFollowing } from 'web/hooks/use-follows'
import { isBlocked, usePrivateUser, useUser } from 'web/hooks/use-user'
import { follow, unfollow } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { Button } from './button'

export function FollowButton(props: { userId: string }) {
  const { userId } = props
  const user = useUser()
  const { isFollowing, setIsFollowing } = useIsFollowing(user?.id, userId)
  const privateUser = usePrivateUser()
  if (!user || user.id === userId) return null
  if (isBlocked(privateUser, userId)) return <div />

  const onFollow = () => {
    track('follow')
    follow(user.id, userId).then(() => setIsFollowing(true))
  }

  const onUnfollow = () => {
    track('unfollow')
    unfollow(user.id, userId).then(() => setIsFollowing(false))
  }

  return (
    <Button
      size="sm"
      color={isFollowing ? 'gray-outline' : 'indigo'}
      className="my-auto"
      onClick={isFollowing ? onUnfollow : onFollow}
    >
      {isFollowing ? 'Following' : 'Follow'}
    </Button>
  )
}
