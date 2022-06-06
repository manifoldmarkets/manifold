import { Fold } from 'common/fold'
import { useFollowedFoldIds } from 'web/hooks/use-fold'
import { useUser } from 'web/hooks/use-user'
import { followFold, unfollowFold } from 'web/lib/firebase/folds'
import { FollowButton } from '../follow-button'

export function FollowFoldButton(props: { fold: Fold; className?: string }) {
  const { fold, className } = props

  const user = useUser()

  const followedFoldIds = useFollowedFoldIds(user)
  const isFollowing = followedFoldIds
    ? followedFoldIds.includes(fold.id)
    : undefined

  const onFollow = () => {
    if (user) followFold(fold.id, user.id)
  }

  const onUnfollow = () => {
    if (user) unfollowFold(fold, user)
  }

  return (
    <FollowButton
      isFollowing={isFollowing}
      onFollow={onFollow}
      onUnfollow={onUnfollow}
      className={className}
    />
  )
}
