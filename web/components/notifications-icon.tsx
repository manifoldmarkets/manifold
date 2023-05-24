import { BellIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Row } from 'web/components/layout/row'
import { useEffect, useState } from 'react'
import { usePrivateUser } from 'web/hooks/use-user'
import { useRouter } from 'next/router'
import { useGroupedUnseenNotifications } from 'web/hooks/use-notifications'
import { PrivateUser } from 'common/user'
import { NOTIFICATIONS_PER_PAGE } from './notifications/notification-helpers'
import { markNotificationAsSeen } from 'web/lib/firebase/notifications'
import { keyBy } from 'lodash'

export default function NotificationsIcon(props: { className?: string }) {
  const privateUser = usePrivateUser()

  return (
    <Row className="relative justify-center">
      {privateUser && <UnseenNotificationsBubble privateUser={privateUser} />}
      <BellIcon className={clsx(props.className)} />
    </Row>
  )
}
function UnseenNotificationsBubble(props: { privateUser: PrivateUser }) {
  const { isReady, pathname, asPath } = useRouter()
  const { privateUser } = props
  const [seen, setSeen] = useState(false)
  const unseenSourceIdsToNotificationIds = keyBy(
    (useGroupedUnseenNotifications(privateUser.id) ?? []).flatMap(
      (n) => n.notifications
    ),
    (n) => n.sourceId
  )
  const unseenNotifs = Object.keys(unseenSourceIdsToNotificationIds).length

  useEffect(() => {
    if (isReady) {
      setSeen(pathname.endsWith('notifications'))
    }
    if (unseenNotifs === 0) return
    // If a user navigates to an unseen notification's source id, mark it as seen
    const possibleSourceId = asPath.split('#')[1]
    if (unseenSourceIdsToNotificationIds[possibleSourceId]) {
      markNotificationAsSeen(
        privateUser.id,
        unseenSourceIdsToNotificationIds[possibleSourceId].id
      )
    }
  }, [asPath, isReady, pathname, privateUser.id, unseenNotifs])

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
