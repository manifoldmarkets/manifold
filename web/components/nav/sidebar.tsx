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
import { useUser } from 'web/hooks/use-user'
import { firebaseLogout, User } from 'web/lib/firebase/users'
import { ManifoldLogo } from './manifold-logo'
import { MenuButton } from './menu'
import { ProfileSummary } from './profile-menu'
import NotificationsIcon from 'web/components/notifications-icon'
import React, { useState } from 'react'
import { IS_PRIVATE_MANIFOLD } from 'common/envs/constants'
import { CreateQuestionButton } from 'web/components/create-question-button'
import { useMemberGroups } from 'web/hooks/use-group'
import { groupPath } from 'web/lib/firebase/groups'
import { trackCallback, withTracking } from 'web/lib/service/analytics'
import { Group } from 'common/group'
import { Spacer } from '../layout/spacer'
import { useWindowSize } from 'web/hooks/use-window-size'
import { CHALLENGES_ENABLED } from 'common/challenge'
import { buildArray } from 'common/util/array'

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
    return [
      { name: 'Leaderboards', href: '/leaderboards' },
      {
        name: 'Sign out',
        href: '#',
        onClick: logout,
      },
    ]
  }

  if (!user) {
    return buildArray(
      CHALLENGES_ENABLED && { name: 'Challenges', href: '/challenges' },
      [
        { name: 'Charity', href: '/charity' },
        {
          name: 'Salem tournament',
          href: 'https://salemcenter.manifold.markets/',
        },
        { name: 'Blog', href: 'https://news.manifold.markets' },
        { name: 'Discord', href: 'https://discord.gg/eHQBNBqXuh' },
        { name: 'Twitter', href: 'https://twitter.com/ManifoldMarkets' },
      ]
    )
  }

  return buildArray(
    CHALLENGES_ENABLED && { name: 'Challenges', href: '/challenges' },
    [
      { name: 'Referrals', href: '/referrals' },
      { name: 'Charity', href: '/charity' },
      { name: 'Send M$', href: '/links' },
      {
        name: 'Salem tournament',
        href: 'https://salemcenter.manifold.markets/',
      },
      { name: 'Discord', href: 'https://discord.gg/eHQBNBqXuh' },
      { name: 'Help & About', href: 'https://help.manifold.markets/' },
      {
        name: 'Sign out',
        href: '#',
        onClick: logout,
      },
    ]
  )
}

const signedOutNavigation = [
  { name: 'Home', href: '/', icon: HomeIcon },
  { name: 'Explore', href: '/home', icon: SearchIcon },
  {
    name: 'Help & About',
    href: 'https://help.manifold.markets/',
    icon: BookOpenIcon,
  },
]

const signedOutMobileNavigation = [
  {
    name: 'Help & About',
    href: 'https://help.manifold.markets/',
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
    name: 'Help & About',
    href: 'https://help.manifold.markets/',
    icon: BookOpenIcon,
  },
]

function getMoreMobileNav() {
  const signOut = {
    name: 'Sign out',
    href: '#',
    onClick: logout,
  }
  if (IS_PRIVATE_MANIFOLD) return [signOut]

  return buildArray<Item>(
    CHALLENGES_ENABLED && { name: 'Challenges', href: '/challenges' },
    [
      { name: 'Referrals', href: '/referrals' },
      {
        name: 'Salem tournament',
        href: 'https://salemcenter.manifold.markets/',
      },
      { name: 'Charity', href: '/charity' },
      { name: 'Send M$', href: '/links' },
      { name: 'Discord', href: 'https://discord.gg/eHQBNBqXuh' },
    ],
    signOut
  )
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

  const navigationOptions = !user ? signedOutNavigation : getNavigation()
  const mobileNavigationOptions = !user
    ? signedOutMobileNavigation
    : signedInMobileNavigation

  const memberItems = (
    useMemberGroups(user?.id, undefined, {
      by: 'mostRecentContractAddedTime',
    }) ?? []
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
        <GroupsList currentPage={router.asPath} memberItems={memberItems} />
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
        <GroupsList currentPage={router.asPath} memberItems={memberItems} />
      </div>
    </nav>
  )
}

function GroupsList(props: { currentPage: string; memberItems: Item[] }) {
  const { currentPage, memberItems } = props

  const { height } = useWindowSize()
  const [containerRef, setContainerRef] = useState<HTMLDivElement | null>(null)
  const remainingHeight = (height ?? 0) - (containerRef?.offsetTop ?? 0)

  // const preferredNotifications = useUnseenPreferredNotifications(
  //   privateUser,
  //   {
  //     customHref: '/group/',
  //   },
  //   memberItems.length > 0 ? memberItems.length : undefined
  // )
  // const notifIsForThisItem = useMemo(
  //   () => (itemHref: string) =>
  //     preferredNotifications.some(
  //       (n) =>
  //         !n.isSeen &&
  //         (n.isSeenOnHref === itemHref ||
  //           n.isSeenOnHref?.replace('/chat', '') === itemHref)
  //     ),
  //   [preferredNotifications]
  // )

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
            href={item.href}
            key={item.name}
            onClick={trackCallback('click sidebar group', { name: item.name })}
            className={clsx(
              'cursor-pointer truncate',
              'group flex items-center rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            )}
          >
            {item.name}
          </a>
        ))}
      </div>
    </>
  )
}
