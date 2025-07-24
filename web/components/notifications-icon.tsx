'use client'
// import { BellIcon } from '@heroicons/react/outline'
import {
  NOTIFICATIONS_PER_PAGE,
  useGroupedUnseenNotifications,
} from 'client-common/hooks/use-notifications'
import { PrivateUser } from 'common/user'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import {
  IoNotificationsOutline as BellIcon,
  IoNotifications as BellIconSolid,
} from 'react-icons/io5'
import { Row } from 'web/components/layout/row'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { useUnseenPrivateMessageChannels } from 'web/hooks/use-private-messages'
import { usePrivateUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'

export function NotificationsIcon(props: {
  className?: string
  solid?: boolean
}) {
  const privateUser = usePrivateUser()
  const { className, solid } = props
  const Icon = solid ? BellIconSolid : BellIcon
  return (
    <Row className="relative justify-center">
      {privateUser && <UnseenNotificationsBubble privateUser={privateUser} />}
      <Icon className={className} />
    </Row>
  )
}

function UnseenNotificationsBubble(props: { privateUser: PrivateUser }) {
  const pathname = usePathname()
  const { privateUser } = props
  const [lastSeenTime, setLastSeenTime] = usePersistentLocalState(
    0,
    'notifications-seen-time'
  )
  const unseenNotificationGroups =
    useGroupedUnseenNotifications(
      privateUser.id,
      (params) => api('get-notifications', params),
      usePersistentLocalState
    ) ?? []

  const { unseenChannels } = useUnseenPrivateMessageChannels(false)

  const unseenNotifs =
    unseenNotificationGroups.filter((ng) => ng.latestCreatedTime > lastSeenTime)
      .length + unseenChannels.length

  useEffect(() => {
    if (pathname?.endsWith('notifications')) {
      setLastSeenTime(Date.now())
    }
  }, [pathname, unseenNotifs])

  if (unseenNotifs === 0) {
    return null
  }

  return (
    <div className="-mt-0.75 text-ink-0 bg-primary-500 absolute ml-3.5 min-w-[15px] rounded-full p-[2px] text-center text-[10px] leading-3 lg:left-0 lg:-mt-1 lg:ml-2">
      {unseenNotifs > NOTIFICATIONS_PER_PAGE
        ? `${NOTIFICATIONS_PER_PAGE}+`
        : unseenNotifs}
    </div>
  )
}
