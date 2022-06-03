import clsx from 'clsx'
import { useUser } from 'web/hooks/use-user'

export function FollowButton(props: {
  isFollowing: boolean | undefined
  onFollow: () => void
  onUnfollow: () => void
  className?: string
}) {
  const { isFollowing, onFollow, onUnfollow, className } = props

  const user = useUser()

  if (!user || isFollowing === undefined)
    return (
      <button className={clsx('btn btn-sm invisible', className)}>
        Follow
      </button>
    )

  if (isFollowing) {
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
