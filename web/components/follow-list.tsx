import clsx from 'clsx'
import { useUser, useUserById } from 'web/hooks/use-user'
import { follow, unfollow } from 'web/lib/firebase/users'
import { Avatar } from './widgets/avatar'
import { FollowButton } from './buttons/follow-button'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { UserLink } from 'web/components/widgets/user-link'
import { LoadingIndicator } from './widgets/loading-indicator'

export function FollowList(props: {
  userIds?: string[]
  myFollowedIds?: string[]
}) {
  const { userIds, myFollowedIds } = props
  const currentUser = useUser()

  const onFollow = (userId: string) => {
    if (!currentUser) return
    follow(currentUser.id, userId)
  }
  const onUnfollow = (userId: string) => {
    if (!currentUser) return
    unfollow(currentUser.id, userId)
  }

  if (userIds == null || myFollowedIds == null) {
    return <LoadingIndicator className="py-4" />
  }

  return (
    <Col className="gap-2 overflow-auto pt-4">
      {userIds.length === 0 && (
        <div className="text-ink-500">No users yet...</div>
      )}
      {userIds.map((userId) => (
        <UserFollowItem
          key={userId}
          userId={userId}
          isFollowing={myFollowedIds ? myFollowedIds.includes(userId) : false}
          onFollow={() => onFollow(userId)}
          onUnfollow={() => onUnfollow(userId)}
          hideFollowButton={userId === currentUser?.id}
        />
      ))}
    </Col>
  )
}

function UserFollowItem(props: {
  userId: string
  isFollowing: boolean
  onFollow: () => void
  onUnfollow: () => void
  hideFollowButton?: boolean
  className?: string
}) {
  const {
    userId,
    isFollowing,
    onFollow,
    onUnfollow,
    hideFollowButton,
    className,
  } = props
  const user = useUserById(userId)

  return (
    <Row className={clsx('items-center justify-between gap-2 p-2', className)}>
      <Row className="items-center gap-2">
        <Avatar username={user?.username} avatarUrl={user?.avatarUrl} />
        {user && <UserLink name={user.name} username={user.username} />}
      </Row>
      {!hideFollowButton && (
        <FollowButton
          isFollowing={isFollowing}
          onFollow={onFollow}
          onUnfollow={onUnfollow}
        />
      )}
    </Row>
  )
}
