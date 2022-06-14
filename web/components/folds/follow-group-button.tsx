import { Group } from 'common/group'
import { useFollowedGroupIds } from 'web/hooks/use-group'
import { useUser } from 'web/hooks/use-user'
import { followGroup, unfollowGroup } from 'web/lib/firebase/groups'
import { FollowButton } from '../follow-button'

export function FollowGroupButton(props: { group: Group; className?: string }) {
  const { group, className } = props

  const user = useUser()

  const followedGroupIds = useFollowedGroupIds(user)
  const isFollowing = followedGroupIds
    ? followedGroupIds.includes(group.id)
    : undefined

  const onFollow = () => {
    if (user) followGroup(group.id, user.id)
  }

  const onUnfollow = () => {
    if (user) unfollowGroup(group, user)
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
