import { ClipboardIcon, HomeIcon } from '@heroicons/react/outline'
import { Item } from './sidebar-item'

import clsx from 'clsx'
import { trackCallback } from 'web/lib/service/analytics'
import TrophyIcon from 'web/lib/icons/trophy-icon'
import { useUser } from 'web/hooks/use-user'
import NotificationsIcon from '../notifications-icon'
import { userProfileItem } from './bottom-nav-bar'
import Link from 'next/link'

const mobileGroupNavigation = (slug: string) => [
  {
    name: 'Markets',
    key: 'markets',
    icon: HomeIcon,
    href: `/group/${slug}/markets`,
  },
  {
    name: 'About',
    key: 'about',
    icon: ClipboardIcon,
    href: `/group/${slug}/about`,
  },
  {
    name: 'Leaderboard',
    key: 'leaderboards',
    icon: TrophyIcon,
    href: `/group/${slug}/leaderboards`,
  },
]
const mobileGeneralNavigation = [
  {
    name: 'Notifications',
    key: 'notifications',
    icon: NotificationsIcon,
    href: '/notifications',
  },
]

export function GroupNavBar(props: { currentPage: string; groupSlug: string }) {
  const { currentPage, groupSlug } = props
  const user = useUser()

  return (
    <nav className="z-20 flex justify-between border-t-2 bg-white text-xs text-gray-700 lg:hidden">
      {mobileGroupNavigation(groupSlug).map((item) => (
        <NavBarItem key={item.name} item={item} currentPage={currentPage} />
      ))}

      {mobileGeneralNavigation.map((item) => (
        <NavBarItem key={item.name} item={item} currentPage={currentPage} />
      ))}

      {user && (
        <NavBarItem
          key={'profile'}
          currentPage={currentPage}
          item={userProfileItem(user)}
        />
      )}
    </nav>
  )
}

function NavBarItem(props: { item: Item; currentPage: string }) {
  const { item, currentPage } = props
  const track = trackCallback(
    `group navbar: ${item.trackingEventName ?? item.name}`
  )

  return (
    <Link href={item.href}>
      <a
        className={clsx(
          'block w-full py-1 px-3 text-center hover:bg-indigo-200 hover:text-indigo-700',
          currentPage === item.key && 'bg-gray-200 text-indigo-700'
        )}
        onClick={track}
      >
        {item.icon && <item.icon className="my-1 mx-auto h-6 w-6" />}
        {item.name}
      </a>
    </Link>
  )
}
