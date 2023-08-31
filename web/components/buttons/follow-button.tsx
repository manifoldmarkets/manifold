import { useIsFollowing } from 'web/hooks/use-follows'
import { isBlocked, usePrivateUser, useUser } from 'web/hooks/use-user'
import { followUser, unfollowUser } from 'web/lib/firebase/api'
import { track } from 'web/lib/service/analytics'
import { Button } from './button'

export const onFollowClick = (
  userId: string,
  isFollowing: boolean,
  setIsFollowing: (isFollowing: boolean) => void
) => {
  const onFollow = () => {
    track('follow')
    followUser(userId).then(() => setIsFollowing(true))
  }

  const onUnfollow = () => {
    track('unfollow')
    unfollowUser(userId).then(() => setIsFollowing(false))
  }
  if (isFollowing) {
    onUnfollow()
  } else {
    onFollow()
  }
}

export function FollowButton(props: { userId: string }) {
  const { userId } = props
  const user = useUser()
  const { isFollowing, setIsFollowing } = useIsFollowing(user?.id, userId)
  const privateUser = usePrivateUser()
  if (!user || user.id === userId) return null
  if (isBlocked(privateUser, userId)) return <div />

  return (
    <Button
      size="sm"
      color={isFollowing ? 'gray-outline' : 'indigo'}
      className="my-auto"
      onClick={() => onFollowClick(userId, isFollowing, setIsFollowing)}
    >
      {isFollowing ? 'Following' : 'Follow'}
    </Button>
  )
}
