import { BellIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Row } from 'web/components/layout/row'
import { useEffect, useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { useRouter } from 'next/router'
import { useNotifications } from 'web/hooks/use-notifications'

export default function NotificationsIcon(props: { className?: string }) {
  const user = useUser()
  const notifications = useNotifications(user?.id, { unseenOnly: true })
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
          <div className="absolute mt-0.5 ml-3.5 min-h-[10px] min-w-[10px] rounded-full bg-indigo-500 p-[2px] text-center text-[10px] leading-3 text-white lg:-mt-0 lg:ml-2.5"></div>
        )}
        <BellIcon className={clsx(props.className)} />
      </div>
    </Row>
  )
}
