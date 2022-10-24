import clsx from 'clsx'
import { Avatar } from './widgets/avatar'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { User } from 'common/user'
import { UserCircleIcon } from '@heroicons/react/solid'
import { useUsers } from 'web/hooks/use-users'
import { partition } from 'lodash'
import { useWindowSize } from 'web/hooks/use-window-size'
import { useState } from 'react'
import { UserLink } from 'web/components/widgets/user-link'

const isOnline = (user?: User) =>
  user && user.lastPingTime && user.lastPingTime > Date.now() - 5 * 60 * 1000

export function OnlineUserList(props: { users: User[] }) {
  let { users } = props
  const liveUsers = useUsers().filter((user) =>
    users.map((u) => u.id).includes(user.id)
  )
  if (liveUsers) users = liveUsers
  const [onlineUsers, offlineUsers] = partition(users, (user) => isOnline(user))
  const { width, height } = useWindowSize()
  const [containerRef, setContainerRef] = useState<HTMLDivElement | null>(null)
  // Subtract bottom bar when it's showing (less than lg screen)
  const bottomBarHeight = (width ?? 0) < 1024 ? 58 : 0
  const remainingHeight =
    (height ?? 0) - (containerRef?.offsetTop ?? 0) - bottomBarHeight
  return (
    <Col
      className="mt-4 flex-1 gap-1 hover:overflow-auto"
      ref={setContainerRef}
      style={{ height: remainingHeight }}
    >
      {onlineUsers
        .concat(
          offlineUsers.sort(
            (a, b) => (b.lastPingTime ?? 0) - (a.lastPingTime ?? 0)
          )
        )
        .slice(0, 15)
        .map((user) => (
          <Row
            key={user.id}
            className={clsx('items-center justify-between gap-2 p-2')}
          >
            <OnlineUserAvatar key={user.id} user={user} size={'sm'} />
          </Row>
        ))}
    </Col>
  )
}

export function OnlineUserAvatar(props: {
  user?: User
  className?: string
  size?: 'sm' | 'xs' | number
}) {
  const { user, className, size } = props

  return (
    <Row className={clsx('relative items-center gap-2', className)}>
      <Avatar
        username={user?.username}
        avatarUrl={user?.avatarUrl}
        size={size}
        className={!isOnline(user) ? 'opacity-50' : ''}
      />
      {user && (
        <UserLink
          name={user.name}
          username={user.username}
          className={!isOnline(user) ? 'text-gray-500' : ''}
        />
      )}
      {isOnline(user) && (
        <div className="absolute left-0 top-0 ">
          <UserCircleIcon className="h-3 w-3 rounded-full border-2 border-white bg-teal-600 text-teal-500" />
        </div>
      )}
    </Row>
  )
}
