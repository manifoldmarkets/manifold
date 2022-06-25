import {
  HomeIcon,
  SearchIcon,
  BookOpenIcon,
  DotsHorizontalIcon,
  CashIcon,
  HeartIcon,
  PresentationChartLineIcon,
  UserGroupIcon,
  ChevronDownIcon,
  TrendingUpIcon,
} from '@heroicons/react/outline'
import clsx from 'clsx'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogout, User } from 'web/lib/firebase/users'
import { ManifoldLogo } from './manifold-logo'
import { MenuButton } from './menu'
import { ProfileSummary } from './profile-menu'
import NotificationsIcon from 'web/components/notifications-icon'
import React from 'react'
import { IS_PRIVATE_MANIFOLD } from 'common/envs/constants'
import { CreateQuestionButton } from 'web/components/create-question-button'
import { useMemberGroups } from 'web/hooks/use-group'
import { groupPath } from 'web/lib/firebase/groups'
import { trackCallback, withTracking } from 'web/lib/service/analytics'
import { Group } from 'common/group'

function getNavigation(username: string) {
  return [
    { name: 'Home', href: '/home', icon: HomeIcon },
    {
      name: 'Portfolio',
      href: `/${username}?tab=bets`,
      icon: PresentationChartLineIcon,
    },
    {
      name: 'Notifications',
      href: `/notifications`,
      icon: NotificationsIcon,
    },

    ...(IS_PRIVATE_MANIFOLD
      ? []
      : [{ name: 'Get M$', href: '/add-funds', icon: CashIcon }]),
  ]
}

function getMoreNavigation(user?: User | null) {
  if (IS_PRIVATE_MANIFOLD) {
    return [{ name: 'Leaderboards', href: '/leaderboards' }]
  }

  if (!user) {
    return [
      { name: 'Leaderboards', href: '/leaderboards' },
      { name: 'Charity', href: '/charity' },
      { name: 'Blog', href: 'https://news.manifold.markets' },
      { name: 'Discord', href: 'https://discord.gg/eHQBNBqXuh' },
      { name: 'Twitter', href: 'https://twitter.com/ManifoldMarkets' },
    ]
  }

  return [
    { name: 'Leaderboards', href: '/leaderboards' },
    { name: 'Charity', href: '/charity' },
    { name: 'Blog', href: 'https://news.manifold.markets' },
    { name: 'Discord', href: 'https://discord.gg/eHQBNBqXuh' },
    { name: 'Twitter', href: 'https://twitter.com/ManifoldMarkets' },
    { name: 'Statistics', href: '/stats' },
    { name: 'About', href: 'https://docs.manifold.markets/$how-to' },
    {
      name: 'Sign out',
      href: '#',
      onClick: withTracking(firebaseLogout, 'sign out'),
    },
  ]
}

const signedOutNavigation = [
  { name: 'Home', href: '/home', icon: HomeIcon },
  { name: 'Explore', href: '/markets', icon: SearchIcon },
  { name: 'Charity', href: '/charity', icon: HeartIcon },
  {
    name: 'About',
    href: 'https://docs.manifold.markets/$how-to',
    icon: BookOpenIcon,
  },
]

const signedOutMobileNavigation = [
  { name: 'Charity', href: '/charity', icon: HeartIcon },
  { name: 'Leaderboards', href: '/leaderboards', icon: TrendingUpIcon },
  {
    name: 'About',
    href: 'https://docs.manifold.markets/$how-to',
    icon: BookOpenIcon,
  },
]

const signedInMobileNavigation = [
  ...(IS_PRIVATE_MANIFOLD
    ? []
    : [{ name: 'Get M$', href: '/add-funds', icon: CashIcon }]),
  ...signedOutMobileNavigation,
]

export type Item = {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

function SidebarItem(props: { item: Item; currentPage: string }) {
  const { item, currentPage } = props
  return (
    <Link href={item.href} key={item.name}>
      <a
        onClick={trackCallback('sidebar: ' + item.name)}
        className={clsx(
          item.href == currentPage
            ? 'bg-gray-200 text-gray-900'
            : 'text-gray-600 hover:bg-gray-100',
          'group flex items-center rounded-md px-3 py-2 text-sm font-medium'
        )}
        aria-current={item.href == currentPage ? 'page' : undefined}
      >
        <item.icon
          className={clsx(
            item.href == currentPage
              ? 'text-gray-500'
              : 'text-gray-400 group-hover:text-gray-500',
            '-ml-1 mr-3 h-6 w-6 flex-shrink-0'
          )}
          aria-hidden="true"
        />
        <span className="truncate">{item.name}</span>
      </a>
    </Link>
  )
}

function SidebarButton(props: {
  text: string
  icon: React.ComponentType<{ className?: string }>
  children?: React.ReactNode
}) {
  const { text, children } = props
  return (
    <a className="group flex items-center rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:cursor-pointer hover:bg-gray-100">
      <props.icon
        className="-ml-1 mr-3 h-6 w-6 flex-shrink-0 text-gray-400 group-hover:text-gray-500"
        aria-hidden="true"
      />
      <span className="truncate">{text}</span>
      {children}
    </a>
  )
}

function MoreButton() {
  return <SidebarButton text={'More'} icon={DotsHorizontalIcon} />
}

function GroupsButton() {
  return (
    <SidebarButton icon={UserGroupIcon} text={'Groups'}>
      <ChevronDownIcon className=" mt-0.5 ml-2 h-5 w-5" aria-hidden="true" />
    </SidebarButton>
  )
}

export default function Sidebar(props: { className?: string }) {
  const { className } = props
  const router = useRouter()
  const currentPage = router.pathname

  const user = useUser()
  const navigationOptions = !user
    ? signedOutNavigation
    : getNavigation(user?.username || 'error')
  const mobileNavigationOptions = !user
    ? signedOutMobileNavigation
    : signedInMobileNavigation
  const memberItems = (useMemberGroups(user) ?? []).map((group: Group) => ({
    name: group.name,
    href: groupPath(group.slug),
  }))

  return (
    <nav aria-label="Sidebar" className={className}>
      <ManifoldLogo className="pb-6" twoLine />
      {user && (
        <div className="mb-2" style={{ minHeight: 80 }}>
          <ProfileSummary user={user} />
        </div>
      )}

      {/* Mobile navigation */}
      <div className="space-y-1 lg:hidden">
        {user && (
          <MenuButton
            buttonContent={<GroupsButton />}
            menuItems={[{ name: 'Explore', href: '/groups' }, ...memberItems]}
            className={'relative z-50 flex-shrink-0'}
          />
        )}
        {mobileNavigationOptions.map((item) => (
          <SidebarItem key={item.href} item={item} currentPage={currentPage} />
        ))}
        {!user && (
          <SidebarItem
            key={'Groups'}
            item={{ name: 'Groups', href: '/groups', icon: UserGroupIcon }}
            currentPage={currentPage}
          />
        )}

        {user && (
          <MenuButton
            menuItems={[
              {
                name: 'Blog',
                href: 'https://news.manifold.markets',
              },
              {
                name: 'Discord',
                href: 'https://discord.gg/eHQBNBqXuh',
              },
              {
                name: 'Twitter',
                href: 'https://twitter.com/ManifoldMarkets',
              },
              {
                name: 'Statistics',
                href: '/stats',
              },
              {
                name: 'Sign out',
                href: '#',
                onClick: withTracking(firebaseLogout, 'sign out'),
              },
            ]}
            buttonContent={<MoreButton />}
          />
        )}
      </div>

      {/* Desktop navigation */}
      <div className="hidden space-y-1 lg:block">
        {navigationOptions.map((item) =>
          item.name === 'Notifications' ? (
            <div key={item.href}>
              <SidebarItem item={item} currentPage={currentPage} />
              {user && (
                <MenuButton
                  key={'groupsdropdown'}
                  buttonContent={<GroupsButton />}
                  menuItems={[
                    { name: 'Explore', href: '/groups' },
                    ...memberItems,
                  ]}
                  className={'relative z-50 flex-shrink-0'}
                />
              )}
            </div>
          ) : (
            <SidebarItem
              key={item.href}
              item={item}
              currentPage={currentPage}
            />
          )
        )}

        <MenuButton
          menuItems={getMoreNavigation(user)}
          buttonContent={<MoreButton />}
        />
      </div>
      <CreateQuestionButton user={user} />
    </nav>
  )
}
