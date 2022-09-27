import React from 'react'
import {
  HomeIcon,
  SearchIcon,
  BookOpenIcon,
  CashIcon,
  HeartIcon,
  ChatIcon,
  ChartBarIcon,
} from '@heroicons/react/outline'
import clsx from 'clsx'
import Router, { useRouter } from 'next/router'

import { useUser } from 'web/hooks/use-user'
import { firebaseLogout, User } from 'web/lib/firebase/users'
import { ManifoldLogo } from './manifold-logo'
import { MenuButton, MenuItem } from './menu'
import { ProfileSummary } from './profile-menu'
import NotificationsIcon from 'web/components/notifications-icon'
import { IS_PRIVATE_MANIFOLD } from 'common/envs/constants'
import { CreateQuestionButton } from 'web/components/create-question-button'
import { withTracking } from 'web/lib/service/analytics'
import { CHALLENGES_ENABLED } from 'common/challenge'
import { buildArray } from 'common/util/array'
import TrophyIcon from 'web/lib/icons/trophy-icon'
import { SignInButton } from '../sign-in-button'
import { SidebarItem } from './sidebar-item'
import { MoreButton } from './more-button'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'

export default function Sidebar(props: {
  className?: string
  logoSubheading?: string
}) {
  const { className, logoSubheading } = props
  const router = useRouter()
  const currentPage = router.pathname

  const user = useUser()

  const desktopNavOptions = !user
    ? signedOutDesktopNavigation
    : getDesktopNavigation()

  const mobileNavOptions = !user
    ? signedOutMobileNavigation
    : signedInMobileNavigation

  const createMarketButton = user && !user.isBannedFromPosting && (
    <CreateQuestionButton />
  )

  return (
    <nav
      aria-label="Sidebar"
      className={clsx('flex max-h-[100vh] flex-col', className)}
    >
      <ManifoldLogo className="pt-6" twoLine />
      {logoSubheading && (
        <Row className="pl-2 text-2xl text-indigo-700 sm:mt-3">
          {logoSubheading}
        </Row>
      )}
      <Spacer h={6} />

      {!user && <SignInButton className="mb-4" />}

      {user && <ProfileSummary user={user} />}

      {/* Mobile navigation */}
      <div className="flex min-h-0 shrink flex-col gap-1 lg:hidden">
        {mobileNavOptions.map((item) => (
          <SidebarItem key={item.href} item={item} currentPage={currentPage} />
        ))}

        {user && (
          <MenuButton
            menuItems={getMoreMobileNav()}
            buttonContent={<MoreButton />}
          />
        )}

        {createMarketButton}
      </div>

      {/* Desktop navigation */}
      <div className="hidden min-h-0 shrink flex-col items-stretch gap-1 lg:flex ">
        {desktopNavOptions.map((item) => (
          <SidebarItem key={item.href} item={item} currentPage={currentPage} />
        ))}
        <MenuButton
          menuItems={getMoreDesktopNavigation(user)}
          buttonContent={<MoreButton />}
        />

        {createMarketButton}
      </div>
    </nav>
  )
}

const logout = async () => {
  // log out, and then reload the page, in case SSR wants to boot them out
  // of whatever logged-in-only area of the site they might be in
  await withTracking(firebaseLogout, 'sign out')()
  await Router.replace(Router.asPath)
}

function getDesktopNavigation() {
  return [
    { name: 'Home', href: '/home', icon: HomeIcon },
    { name: 'Search', href: '/search', icon: SearchIcon },
    {
      name: 'Notifications',
      href: `/notifications`,
      icon: NotificationsIcon,
    },

    ...(IS_PRIVATE_MANIFOLD
      ? []
      : [
          { name: 'Get M$', href: '/add-funds', icon: CashIcon },
          { name: 'Tournaments', href: '/tournaments', icon: TrophyIcon },
        ]),
  ]
}

function getMoreDesktopNavigation(user?: User | null) {
  if (IS_PRIVATE_MANIFOLD) {
    return [
      { name: 'Leaderboards', href: '/leaderboards', icon: ChartBarIcon },
      {
        name: 'Sign out',
        href: '#',
        onClick: logout,
      },
    ]
  }

  if (!user) {
    // Signed out "More"
    return buildArray(
      { name: 'Leaderboards', href: '/leaderboards' },
      { name: 'Groups', href: '/groups' },
      CHALLENGES_ENABLED && { name: 'Challenges', href: '/challenges' },
      [
        { name: 'Tournaments', href: '/tournaments' },
        { name: 'Charity', href: '/charity' },
        { name: 'Blog', href: 'https://news.manifold.markets' },
        { name: 'Discord', href: 'https://discord.gg/eHQBNBqXuh' },
        { name: 'Twitter', href: 'https://twitter.com/ManifoldMarkets' },
      ]
    )
  }

  // Signed in "More"
  return buildArray(
    { name: 'Leaderboards', href: '/leaderboards' },
    { name: 'Groups', href: '/groups' },
    CHALLENGES_ENABLED && { name: 'Challenges', href: '/challenges' },
    [
      { name: 'Referrals', href: '/referrals' },
      { name: 'Charity', href: '/charity' },
      { name: 'Send M$', href: '/links' },
      { name: 'Discord', href: 'https://discord.gg/eHQBNBqXuh' },
      { name: 'Dating docs', href: '/date-docs' },
      { name: 'Help & About', href: 'https://help.manifold.markets/' },
      {
        name: 'Sign out',
        href: '#',
        onClick: logout,
      },
    ]
  )
}

const signedOutDesktopNavigation = [
  { name: 'Home', href: '/', icon: HomeIcon },
  { name: 'Explore', href: '/search', icon: SearchIcon },
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
  { name: 'Tournaments', href: '/tournaments', icon: TrophyIcon },
  { name: 'Leaderboards', href: '/leaderboards', icon: ChartBarIcon },
  { name: 'Discord', href: 'https://discord.gg/eHQBNBqXuh', icon: ChatIcon },
]

const signedInMobileNavigation = [
  { name: 'Search', href: '/search', icon: SearchIcon },
  { name: 'Tournaments', href: '/tournaments', icon: TrophyIcon },
  { name: 'Leaderboards', href: '/leaderboards', icon: ChartBarIcon },
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

  return buildArray<MenuItem>(
    CHALLENGES_ENABLED && { name: 'Challenges', href: '/challenges' },
    [
      { name: 'Groups', href: '/groups' },
      { name: 'Referrals', href: '/referrals' },
      { name: 'Charity', href: '/charity' },
      { name: 'Send M$', href: '/links' },
      { name: 'Discord', href: 'https://discord.gg/eHQBNBqXuh' },
      { name: 'Dating docs', href: '/date-docs' },
    ],
    signOut
  )
}
