import { BellIcon } from '@heroicons/react/outline'
import { BellIcon as SolidBellIcon } from '@heroicons/react/solid'
import { Row } from 'web/components/layout/row'
import { useEffect, useState } from 'react'
import { usePrivateUser } from 'web/hooks/use-user'
import { useRouter } from 'next/router'
import { useGroupedUnseenNotifications } from 'web/hooks/use-notifications'
import { PrivateUser } from 'common/user'
import { NOTIFICATIONS_PER_PAGE } from './notifications/notification-helpers'

export function NotificationsIcon(props: { className?: string }) {
  const privateUser = usePrivateUser()

  return (
    <Row className="relative justify-center">
      {privateUser && <UnseenNotificationsBubble privateUser={privateUser} />}
      <BellIcon className={props.className} />
    </Row>
  )
}

export function SolidNotificationsIcon(props: { className?: string }) {
  const privateUser = usePrivateUser()

  return (
    <Row className="relative justify-center">
      {privateUser && <UnseenNotificationsBubble privateUser={privateUser} />}
      <SolidBellIcon className={props.className} />
    </Row>
  )
}

function UnseenNotificationsBubble(props: { privateUser: PrivateUser }) {
  const { isReady, pathname } = useRouter()
  const { privateUser } = props
  const [seen, setSeen] = useState(false)
  const unseenSourceIdsToNotificationIds =
    useGroupedUnseenNotifications(privateUser.id) ?? []

  const unseenNotifs = Object.keys(unseenSourceIdsToNotificationIds).length

  useEffect(() => {
    if (isReady && pathname.endsWith('notifications')) {
      setSeen(pathname.endsWith('notifications'))
    }
  }, [isReady, pathname])

  if (unseenNotifs === 0 || seen) {
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
