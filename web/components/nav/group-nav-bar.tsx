import {
  ClipboardIcon,
  PresentationChartLineIcon,
} from '@heroicons/react/outline'
import { Item } from './sidebar-item'

import clsx from 'clsx'
import { trackCallback } from 'web/lib/service/analytics'
import TrophyIcon from 'web/lib/icons/trophy-icon'
import { useUser } from 'web/hooks/use-user'
import NotificationsIcon from '../notifications-icon'
import router from 'next/router'
import { userProfileItem } from './bottom-nav-bar'
import Link from 'next/link'

const mobileGroupNavigation = [
  { name: 'Markets', key: 'markets', icon: PresentationChartLineIcon },
  { name: 'Leaderboard', key: 'leaderboards', icon: TrophyIcon },
  { name: 'About', key: 'about', icon: ClipboardIcon },
]

const mobileGeneralNavigation = [
  {
    name: 'Notifications',
    key: 'notifications',
    icon: NotificationsIcon,
    href: '/notifications',
  },
]

export function GroupNavBar(props: {
  currentPage: string
  onClick: (key: string) => void
}) {
  const { currentPage } = props
  const user = useUser()

  return (
    <nav className="z-20 flex border-t-2 bg-white text-xs text-gray-700">
      {mobileGroupNavigation.map((item) => (
        <NavBarItem
          key={item.name}
          item={item}
          currentPage={currentPage}
          onClick={props.onClick}
        />
      ))}

      {mobileGeneralNavigation.map((item) => (
        <NavBarItem
          key={item.name}
          item={item}
          currentPage={currentPage}
          onClick={() => {
            router.push(item.href)
          }}
        />
      ))}

      {user && (
        <NavBarItem
          key={'profile'}
          currentPage={currentPage}
          onClick={() => {
            router.push(`/${user.username}?tab=trades`)
          }}
          item={userProfileItem(user)}
        />
      )}
    </nav>
  )
}

function NavBarItem(props: {
  item: Item
  currentPage: string
  onClick: (key: string) => void
}) {
  const { item, currentPage, onClick } = props
  const track = trackCallback(
    `group navbar: ${item.trackingEventName ?? item.name}`
  )

  return (
    <Link href={item.href ?? '#'}>
      <a
        className={clsx(
          'block w-full py-1 px-3 text-center hover:bg-indigo-200 hover:text-indigo-700',
          currentPage === item.key && 'bg-gray-200 text-indigo-700'
        )}
        onClick={() => (onClick?.(item.key ?? '#'), track())}
      >
        {item.icon && <item.icon className="my-1 mx-auto h-6 w-6" />}
        {item.name}
      </a>
    </Link>
  )
}
