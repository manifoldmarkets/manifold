import clsx from 'clsx'
import { Avatar } from './avatar'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { UserLink } from './user-page'
import { User } from 'common/user'
import { UserCircleIcon } from '@heroicons/react/solid'
import { useUsers } from 'web/hooks/use-users'
import { partition } from 'lodash'

const isOnline = (user?: User) =>
  user && user.lastPingTime && user.lastPingTime > Date.now() - 5 * 60 * 1000

export function OnlineUserList(props: { users: User[] }) {
  let { users } = props
  const liveUsers = useUsers().filter((user) =>
    users.map((u) => u.id).includes(user.id)
  )
  if (liveUsers) users = liveUsers
  const [onlineUsers, offlineUsers] = partition(users, (user) => isOnline(user))
  return (
    <Col className="mt-4 gap-1">
      {onlineUsers
        .concat(offlineUsers)
        .slice(0, 15)
        .map((user) => (
          <Row
            key={user.id}
            className={clsx('items-center justify-between gap-2 p-2')}
          >
            <OnlineUserAvatar key={user.id} user={user} />
          </Row>
        ))}
    </Col>
  )
}

export function OnlineUserAvatar(props: { user?: User; className?: string }) {
  const { user, className } = props

  return (
    <Row className={clsx('relative items-center gap-2', className)}>
      <Avatar
        username={user?.username}
        avatarUrl={user?.avatarUrl}
        className={className}
      />
      {user && <UserLink name={user.name} username={user.username} />}
      {isOnline(user) && (
        <div className="absolute left-0 top-0 ">
          <UserCircleIcon className="text-primary bg-primary h-3 w-3 rounded-full border-2 border-white" />
        </div>
      )}
    </Row>
  )
}
