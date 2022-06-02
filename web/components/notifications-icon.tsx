import { BellIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Row } from 'web/components/layout/row'
import { useEffect, useState } from 'react'
import { Notification } from 'common/notification'
import { listenForNotifications } from 'web/lib/firebase/notifications'
import { useUser } from 'web/hooks/use-user'
import { useRouter } from 'next/router'
import { PrivateUser } from 'common/user'
import { listenForPrivateUser } from 'web/lib/firebase/users'
import { GetAppropriateNotifications } from 'web/pages/notifications'

export default function NotificationsIcon(props: { className?: string }) {
  const user = useUser()
  const [notifications, setNotifications] = useState<
    Notification[] | undefined
  >()
  const [privateUser, setPrivateUser] = useState<PrivateUser | null>(null)

  useEffect(() => {
    if (user) listenForPrivateUser(user.id, setPrivateUser)
  }, [user])

  const router = useRouter()
  useEffect(() => {
    if (router.pathname.endsWith('notifications')) return setNotifications([])
  }, [router.pathname])

  useEffect(() => {
    if (privateUser) {
      return listenForNotifications(
        privateUser.id,
        (notifs) =>
          setNotifications(
            GetAppropriateNotifications(
              notifs,
              privateUser.notificationPreferences
            )
          ),
        true
      )
    }
  }, [privateUser])

  return (
    <Row className={clsx('justify-center')}>
      <div className={'relative'}>
        {notifications && notifications.length > 0 && (
          <div className="absolute mt-0.5 ml-3.5 min-h-[10px] min-w-[10px] rounded-full bg-indigo-500 p-[2px] text-center text-[10px] leading-3 text-white lg:-mt-0 lg:ml-2.5"></div>
        )}
        <BellIcon className={clsx(props.className)} />
      </div>
    </Row>
  )
}
