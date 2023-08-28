import {
  HomeIcon,
  SearchIcon,
  BookOpenIcon,
  DotsHorizontalIcon,
  CashIcon,
  HeartIcon,
  TrendingUpIcon,
  ChatIcon,
  ExternalLinkIcon,
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
import { ENV_CONFIG, IS_PRIVATE_MANIFOLD } from 'common/envs/constants'
import React from 'react'
import { CreateQuestionButton } from 'web/components/create-question-button'
import { trackCallback, withTracking } from 'web/lib/service/analytics'
import { Spacer } from '../layout/spacer'
import { CHALLENGES_ENABLED } from 'common/challenge'

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

    { name: 'Leaderboard', href: '/leaderboards', icon: TrendingUpIcon },

    ...(IS_PRIVATE_MANIFOLD
      ? [
          {
            name: 'Rules',
            href: 'https://www.cspicenter.com/p/introducing-the-salemcspi-forecasting',
            icon: BookOpenIcon,
          },
        ]
      : [{ name: 'Get M$', href: '/add-funds', icon: CashIcon }]),
  ]
}

function getMoreNavigation(user?: User | null) {
  if (IS_PRIVATE_MANIFOLD) {
    return [
      { name: 'Discord', href: 'https://discord.gg/ZtT7PxapSS' },
      { name: 'Manifold Markets', href: 'https://manifold.markets' },
      {
        name: 'Sign out',
        href: '#',
        onClick: withTracking(firebaseLogout, 'sign out'),
      },
    ]
  }

  if (!user) {
    if (CHALLENGES_ENABLED)
      return [
        { name: 'Challenges', href: '/challenges' },
        { name: 'Charity', href: '/charity' },
        { name: 'Blog', href: 'https://news.manifold.markets' },
        { name: 'Discord', href: 'https://discord.gg/eHQBNBqXuh' },
        { name: 'Twitter', href: 'https://twitter.com/ManifoldMarkets' },
      ]
    else
      return [
        { name: 'Charity', href: '/charity' },
        { name: 'Blog', href: 'https://news.manifold.markets' },
        { name: 'Discord', href: 'https://discord.gg/eHQBNBqXuh' },
        { name: 'Twitter', href: 'https://twitter.com/ManifoldMarkets' },
      ]
  }

  if (CHALLENGES_ENABLED)
    return [
      { name: 'Challenges', href: '/challenges' },
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
  else
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
  { name: 'Leaderboard', href: '/leaderboards', icon: TrendingUpIcon },
  {
    name: 'Rules',
    href: 'https://www.cspicenter.com/p/introducing-the-salemcspi-forecasting',
    icon: BookOpenIcon,
  },
]

const signedOutMobileNavigation = IS_PRIVATE_MANIFOLD
  ? [
      { name: 'Leaderboard', href: '/leaderboards', icon: TrendingUpIcon },
      {
        name: 'Rules',
        href: 'https://www.cspicenter.com/p/introducing-the-salemcspi-forecasting',
        icon: BookOpenIcon,
      },
      {
        name: 'Discord',
        href: 'https://discord.gg/ZtT7PxapSS',
        icon: ChatIcon,
      },
      {
        name: 'Manifold Markets',
        href: 'https://manifold.markets',
        icon: ExternalLinkIcon,
      },
    ]
  : [
      { name: 'Charity', href: '/charity', icon: HeartIcon },
      { name: 'Leaderboards', href: '/leaderboards', icon: TrendingUpIcon },
      {
        name: 'Discord',
        href: 'https://discord.gg/eHQBNBqXuh',
        icon: ChatIcon,
      },
    ]

const signedInMobileNavigation = [
  { name: 'Leaderboard', href: '/leaderboards', icon: TrendingUpIcon },
  ...(IS_PRIVATE_MANIFOLD
    ? [
        {
          name: 'Rules',
          href: 'https://www.cspicenter.com/p/introducing-the-salemcspi-forecasting',
          icon: BookOpenIcon,
        },
        {
          name: 'Discord',
          href: 'https://discord.gg/ZtT7PxapSS',
          icon: ChatIcon,
        },
        {
          name: 'Manifold Markets',
          href: 'https://manifold.markets',
          icon: ExternalLinkIcon,
        },
      ]
    : [
        { name: 'Get M$', href: '/add-funds', icon: CashIcon },
        {
          name: 'About',
          href: 'https://docs.manifold.markets/$how-to',
          icon: BookOpenIcon,
        },
      ]),
]

function getMoreMobileNav() {
  return [
    ...(IS_PRIVATE_MANIFOLD
      ? []
      : CHALLENGES_ENABLED
      ? [
          { name: 'Challenges', href: '/challenges' },
          { name: 'Referrals', href: '/referrals' },
          { name: 'Charity', href: '/charity' },
          { name: 'Send M$', href: '/links' },
          { name: 'Discord', href: 'https://discord.gg/eHQBNBqXuh' },
        ]
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
  // usePing(user?.id)

  const navigationOptions = !user ? signedOutNavigation : getNavigation()
  const mobileNavigationOptions = !user
    ? signedOutMobileNavigation
    : signedInMobileNavigation

  return (
    <nav aria-label="Sidebar" className={className}>
      <ManifoldLogo className="py-6" twoLine />

      {ENV_CONFIG.whitelistCreators?.includes(user?.username ?? '') && (
        <CreateQuestionButton user={user} />
      )}
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
      </div>

      {/* Desktop navigation */}
      <div className="hidden space-y-1 lg:block">
        {navigationOptions.map((item) => (
          <SidebarItem key={item.href} item={item} currentPage={currentPage} />
        ))}
        {user && (
          <MenuButton
            menuItems={getMoreNavigation(user)}
            buttonContent={<MoreButton />}
          />
        )}
      </div>
    </nav>
  )
}
