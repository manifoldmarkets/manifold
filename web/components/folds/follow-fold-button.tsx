import clsx from 'clsx'
import { Fold } from '../../../common/fold'
import { useFollowedFoldIds } from '../../hooks/use-fold'
import { useUser } from '../../hooks/use-user'
import { followFold, unfollowFold } from '../../lib/firebase/folds'

export function FollowFoldButton(props: { fold: Fold; className?: string }) {
  const { fold, className } = props

  const user = useUser()

  const followedFoldIds = useFollowedFoldIds(user)
  const following = followedFoldIds
    ? followedFoldIds.includes(fold.id)
    : undefined

  const onFollow = () => {
    if (user) followFold(fold.id, user.id)
  }

  const onUnfollow = () => {
    if (user) unfollowFold(fold, user)
  }

  if (!user || following === undefined)
    return (
      <button className={clsx('btn btn-sm invisible', className)}>
        Follow
      </button>
    )

  if (following) {
    return (
      <button
        className={clsx('btn btn-outline btn-sm', className)}
        onClick={onUnfollow}
      >
        Following
      </button>
    )
  }

  return (
    <button className={clsx('btn btn-sm', className)} onClick={onFollow}>
      Follow
    </button>
  )
}
