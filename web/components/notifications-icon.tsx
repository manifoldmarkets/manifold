import { BellIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Row } from 'web/components/layout/row'
import { useEffect, useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { useRouter } from 'next/router'
import { usePreferredGroupedNotifications } from 'web/hooks/use-notifications'

export default function NotificationsIcon(props: { className?: string }) {
  const user = useUser()
  const notifications = usePreferredGroupedNotifications(user?.id, {
    unseenOnly: true,
  })
  const [seen, setSeen] = useState(false)

  const router = useRouter()
  useEffect(() => {
    if (router.pathname.endsWith('notifications')) return setSeen(true)
    else setSeen(false)
  }, [router.pathname])

  return (
    <Row className={clsx('justify-center')}>
      <div className={'relative'}>
        {!seen && notifications && notifications.length > 0 && (
          <div className="-mt-0.75 absolute ml-3.5 min-w-[15px] rounded-full bg-indigo-500 p-[2px] text-center text-[10px] leading-3 text-white lg:-mt-1 lg:ml-2">
            {notifications.length}
          </div>
        )}
        <BellIcon className={clsx(props.className)} />
      </div>
    </Row>
  )
}
