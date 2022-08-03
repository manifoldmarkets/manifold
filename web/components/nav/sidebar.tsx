import {
  HomeIcon,
  SearchIcon,
  BookOpenIcon,
  DotsHorizontalIcon,
  CashIcon,
  HeartIcon,
  UserGroupIcon,
  TrendingUpIcon,
  ChatIcon,
} from '@heroicons/react/outline'
import clsx from 'clsx'
import Link from 'next/link'
import Router, { useRouter } from 'next/router'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { firebaseLogout, User } from 'web/lib/firebase/users'
import { ManifoldLogo } from './manifold-logo'
import { MenuButton } from './menu'
import { ProfileSummary } from './profile-menu'
import NotificationsIcon from 'web/components/notifications-icon'
import React, { useMemo, useState } from 'react'
import { IS_PRIVATE_MANIFOLD } from 'common/envs/constants'
import { CreateQuestionButton } from 'web/components/create-question-button'
import { useMemberGroups } from 'web/hooks/use-group'
import { groupPath } from 'web/lib/firebase/groups'
import { trackCallback, withTracking } from 'web/lib/service/analytics'
import { Group, GROUP_CHAT_SLUG } from 'common/group'
import { Spacer } from '../layout/spacer'
import { useUnseenPreferredNotifications } from 'web/hooks/use-notifications'
import { PrivateUser } from 'common/user'
import { useWindowSize } from 'web/hooks/use-window-size'

const logout = async () => {
  // log out, and then reload the page, in case SSR wants to boot them out
  // of whatever logged-in-only area of the site they might be in
  await withTracking(firebaseLogout, 'sign out')()
  await Router.replace(Router.asPath)
}

function getNavigation() {
  return [
    { name: 'Home', href: '/home', icon: HomeIcon },
    {
      name: 'Notifications',
      href: `/notifications`,
      icon: NotificationsIcon,
    },

    { name: 'Leaderboards', href: '/leaderboards', icon: TrendingUpIcon },

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
      { name: 'Charity', href: '/charity' },
      { name: 'Blog', href: 'https://news.manifold.markets' },
      { name: 'Discord', href: 'https://discord.gg/eHQBNBqXuh' },
      { name: 'Twitter', href: 'https://twitter.com/ManifoldMarkets' },
    ]
  }

  return [
    { name: 'Referrals', href: '/referrals' },
    { name: 'Charity', href: '/charity' },
    { name: 'Send M$', href: '/links' },
    { name: 'Discord', href: 'https://discord.gg/eHQBNBqXuh' },
    { name: 'About', href: 'https://docs.manifold.markets/$how-to' },
    {
      name: 'Sign out',
      href: '#',
      onClick: logout,
    },
  ]
}

const signedOutNavigation = [
  { name: 'Home', href: '/home', icon: HomeIcon },
  { name: 'Explore', href: '/markets', icon: SearchIcon },
  {
    name: 'About',
    href: 'https://docs.manifold.markets/$how-to',
    icon: BookOpenIcon,
  },
]

const signedOutMobileNavigation = [
  {
    name: 'About',
    href: 'https://docs.manifold.markets/$how-to',
    icon: BookOpenIcon,
  },
  { name: 'Charity', href: '/charity', icon: HeartIcon },
  { name: 'Leaderboards', href: '/leaderboards', icon: TrendingUpIcon },
  { name: 'Discord', href: 'https://discord.gg/eHQBNBqXuh', icon: ChatIcon },
]

const signedInMobileNavigation = [
  { name: 'Leaderboards', href: '/leaderboards', icon: TrendingUpIcon },
  ...(IS_PRIVATE_MANIFOLD
    ? []
    : [{ name: 'Get M$', href: '/add-funds', icon: CashIcon }]),
  {
    name: 'About',
    href: 'https://docs.manifold.markets/$how-to',
    icon: BookOpenIcon,
  },
]

function getMoreMobileNav() {
  return [
    ...(IS_PRIVATE_MANIFOLD
      ? []
      : [
          { name: 'Referrals', href: '/referrals' },
          { name: 'Charity', href: '/charity' },
          { name: 'Send M$', href: '/links' },
          { name: 'Discord', href: 'https://discord.gg/eHQBNBqXuh' },
        ]),
    {
      name: 'Sign out',
      href: '#',
      onClick: logout,
    },
  ]
}

export type Item = {
  name: string
  trackingEventName?: string
  href: string
  icon?: React.ComponentType<{ className?: string }>
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
        {item.icon && (
          <item.icon
            className={clsx(
              item.href == currentPage
                ? 'text-gray-500'
                : 'text-gray-400 group-hover:text-gray-500',
              '-ml-1 mr-3 h-6 w-6 flex-shrink-0'
            )}
            aria-hidden="true"
          />
        )}
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

export default function Sidebar(props: { className?: string }) {
  const { className } = props
  const router = useRouter()
  const currentPage = router.pathname

  const user = useUser()
  const privateUser = usePrivateUser(user?.id)
  // usePing(user?.id)

  const navigationOptions = !user ? signedOutNavigation : getNavigation()
  const mobileNavigationOptions = !user
    ? signedOutMobileNavigation
    : signedInMobileNavigation

  const memberItems = (
    useMemberGroups(
      user?.id,
      { withChatEnabled: true },
      { by: 'mostRecentChatActivityTime' }
    ) ?? []
  ).map((group: Group) => ({
    name: group.name,
    href: `${groupPath(group.slug)}`,
  }))

  return (
    <nav aria-label="Sidebar" className={className}>
      <ManifoldLogo className="py-6" twoLine />

      <CreateQuestionButton user={user} />
      <Spacer h={4} />
      {user && (
        <div className="w-full" style={{ minHeight: 80 }}>
          <ProfileSummary user={user} />
        </div>
      )}

      {/* Mobile navigation */}
      <div className="space-y-1 lg:hidden">
        {mobileNavigationOptions.map((item) => (
          <SidebarItem key={item.href} item={item} currentPage={currentPage} />
        ))}

        {user && (
          <MenuButton
            menuItems={getMoreMobileNav()}
            buttonContent={<MoreButton />}
          />
        )}
        {/* Spacer if there are any groups */}
        {memberItems.length > 0 && (
          <hr className="!my-4 mr-2 border-gray-300" />
        )}
        {privateUser && (
          <GroupsList
            currentPage={router.asPath}
            memberItems={memberItems}
            privateUser={privateUser}
          />
        )}
      </div>

      {/* Desktop navigation */}
      <div className="hidden space-y-1 lg:block">
        {navigationOptions.map((item) => (
          <SidebarItem key={item.href} item={item} currentPage={currentPage} />
        ))}
        <MenuButton
          menuItems={getMoreNavigation(user)}
          buttonContent={<MoreButton />}
        />

        {/* Spacer if there are any groups */}
        {memberItems.length > 0 && <hr className="!my-4 border-gray-300" />}
        {privateUser && (
          <GroupsList
            currentPage={router.asPath}
            memberItems={memberItems}
            privateUser={privateUser}
          />
        )}
      </div>
    </nav>
  )
}

function GroupsList(props: {
  currentPage: string
  memberItems: Item[]
  privateUser: PrivateUser
}) {
  const { currentPage, memberItems, privateUser } = props
  const preferredNotifications = useUnseenPreferredNotifications(
    privateUser,
    {
      customHref: '/group/',
    },
    memberItems.length > 0 ? memberItems.length : undefined
  )

  const { height } = useWindowSize()
  const [containerRef, setContainerRef] = useState<HTMLDivElement | null>(null)
  const remainingHeight =
    (height ?? window.innerHeight) - (containerRef?.offsetTop ?? 0)

  const notifIsForThisItem = useMemo(
    () => (itemHref: string) =>
      preferredNotifications.some(
        (n) =>
          !n.isSeen &&
          (n.isSeenOnHref === itemHref ||
            n.isSeenOnHref?.replace('/chat', '') === itemHref)
      ),
    [preferredNotifications]
  )

  return (
    <>
      <SidebarItem
        item={{ name: 'Groups', href: '/groups', icon: UserGroupIcon }}
        currentPage={currentPage}
      />

      <div
        className="flex-1 space-y-0.5 overflow-auto"
        style={{ height: remainingHeight }}
        ref={setContainerRef}
      >
        {memberItems.map((item) => (
          <a
            href={
              item.href +
              (notifIsForThisItem(item.href) ? '/' + GROUP_CHAT_SLUG : '')
            }
            key={item.name}
            onClick={trackCallback('sidebar: ' + item.name)}
            className={clsx(
              'cursor-pointer truncate',
              'group flex items-center rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              notifIsForThisItem(item.href) && 'font-bold'
            )}
          >
            {item.name}
          </a>
        ))}
      </div>
    </>
  )
}
