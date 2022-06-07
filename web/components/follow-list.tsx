import clsx from 'clsx'
import { useFollows } from 'web/hooks/use-follows'
import { useUser, useUserById } from 'web/hooks/use-user'
import { follow, unfollow } from 'web/lib/firebase/users'
import { Avatar } from './avatar'
import { FollowButton } from './follow-button'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { UserLink } from './user-page'

export function FollowList(props: { userIds: string[] }) {
  const { userIds } = props
  const currentUser = useUser()
  const followedUserIds = useFollows(currentUser?.id) ?? []

  const onFollow = (userId: string) => {
    if (!currentUser) return
    follow(currentUser.id, userId)
  }
  const onUnfollow = (userId: string) => {
    if (!currentUser) return
    unfollow(currentUser.id, userId)
  }

  return (
    <Col className="gap-2">
      {userIds.map((userId) => (
        <UserFollowItem
          key={userId}
          userId={userId}
          isFollowing={followedUserIds.includes(userId)}
          onFollow={() => onFollow(userId)}
          onUnfollow={() => onUnfollow(userId)}
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
  className?: string
}) {
  const { userId, isFollowing, onFollow, onUnfollow, className } = props
  const user = useUserById(userId)

  return (
    <Row className={clsx('items-center justify-between gap-2 p-2', className)}>
      <Row className="items-center gap-2">
        <Avatar username={user?.username} avatarUrl={user?.avatarUrl} />
        {user && <UserLink name={user.name} username={user.username} />}
      </Row>
      <FollowButton
        isFollowing={isFollowing}
        onFollow={onFollow}
        onUnfollow={onUnfollow}
      />
    </Row>
  )
}
