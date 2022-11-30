import React from 'react'
import {
  HomeIcon,
  SearchIcon,
  BookOpenIcon,
  UsersIcon,
  ChatIcon,
  ChartBarIcon,
  LogoutIcon,
  BeakerIcon,
  GiftIcon,
  FireIcon,
  HeartIcon,
} from '@heroicons/react/outline'
import clsx from 'clsx'
import Router, { useRouter } from 'next/router'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogout } from 'web/lib/firebase/users'
import { ManifoldLogo } from './manifold-logo'
import { MenuButton } from './menu'
import { ProfileSummary } from './profile-menu'
import NotificationsIcon from 'web/components/notifications-icon'
import { IS_PRIVATE_MANIFOLD } from 'common/envs/constants'
import { CreateQuestionButton } from 'web/components/buttons/create-question-button'
import { withTracking } from 'web/lib/service/analytics'
import { buildArray } from 'common/util/array'
import TrophyIcon from 'web/lib/icons/trophy-icon'
import { SignInButton } from '../buttons/sign-in-button'
import { SidebarItem } from './sidebar-item'
import { MoreButton } from './more-button'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'

export default function Sidebar(props: {
  className?: string
  logoSubheading?: string
  isMobile?: boolean
}) {
  const { className, logoSubheading, isMobile } = props
  const router = useRouter()
  const currentPage = router.pathname

  const user = useUser()

  const navOptions = isMobile ? getMobileNav(!!user) : getDesktopNav(!!user)
  const bottomNavOptions = bottomNav(!!isMobile, !!user)

  const createMarketButton = user && !user.isBannedFromPosting && (
    <CreateQuestionButton />
  )

  return (
    <nav
      aria-label="Sidebar"
      className={clsx('flex h-screen flex-col', className)}
    >
      <ManifoldLogo className="pt-6" twoLine />
      {logoSubheading && (
        <Row className="pl-2 text-2xl text-indigo-700 sm:mt-3">
          {logoSubheading}
        </Row>
      )}
      <Spacer h={6} />

      {user === undefined && <div className="h-[56px]" />}
      {user === null && <SignInButton className="mb-4" />}

      {user && !isMobile && <ProfileSummary user={user} />}

      <div className="flex flex-col gap-1">
        {navOptions.map((item) => (
          <SidebarItem key={item.href} item={item} currentPage={currentPage} />
        ))}

        {!isMobile && (
          <MenuButton
            menuItems={getMoreDesktopNavigation(!!user)}
            buttonContent={<MoreButton />}
          />
        )}

        {createMarketButton}
      </div>
      <div className="mt-auto mb-6 flex flex-col gap-1">
        {bottomNavOptions.map((item) => (
          <SidebarItem key={item.name} item={item} currentPage={currentPage} />
        ))}
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

const getDesktopNav = (loggedIn: boolean) =>
  buildArray(
    { name: 'Home', href: '/home', icon: HomeIcon },
    { name: 'Search', href: '/search', icon: SearchIcon },
    loggedIn && {
      name: 'Notifications',
      href: `/notifications`,
      icon: NotificationsIcon,
    },

    !IS_PRIVATE_MANIFOLD && [
      loggedIn && {
        name: 'Leaderboards',
        href: '/leaderboards',
        icon: ChartBarIcon,
      },
      { name: 'World Cup', href: '/worldcup', icon: TrophyIcon },
    ]
  )

function getMoreDesktopNavigation(loggedIn: boolean) {
  if (IS_PRIVATE_MANIFOLD) {
    return [{ name: 'Leaderboards', href: '/leaderboards', icon: ChartBarIcon }]
  }

  return buildArray(
    { name: 'Groups', href: '/groups' },
    { name: 'Charity', href: '/charity' },
    loggedIn && { name: 'Refer a friend', href: '/referrals' },
    { name: 'Labs', href: '/labs' },
    { name: 'Blog', href: 'https://news.manifold.markets' },
    { name: 'Discord', href: 'https://discord.gg/eHQBNBqXuh' },
    {
      name: 'Help & About',
      href: 'https://help.manifold.markets/',
    },
    loggedIn && { name: 'Sign out', onClick: logout }
  )
}

const getMobileNav = (loggedIn: boolean) => {
  if (IS_PRIVATE_MANIFOLD) {
    return [{ name: 'Leaderboards', href: '/leaderboards', icon: ChartBarIcon }]
  }
  return buildArray(
    loggedIn && { name: 'Swipe', href: '/swipe', icon: FireIcon },
    { name: 'Leaderboards', href: '/leaderboards', icon: ChartBarIcon },
    { name: 'Charity', href: '/charity', icon: HeartIcon },
    { name: 'World Cup', href: '/worldcup', icon: TrophyIcon },
    loggedIn && { name: 'Groups', href: '/groups', icon: UsersIcon },
    loggedIn && { name: 'Refer a friend', href: '/referrals', icon: GiftIcon },
    { name: 'Labs', href: '/labs', icon: BeakerIcon }
  )
}

const bottomNav = (isMobile: boolean, loggedIn: boolean) =>
  buildArray(
    !IS_PRIVATE_MANIFOLD &&
      isMobile && {
        name: 'Discord',
        href: 'https://discord.gg/eHQBNBqXuh',
        icon: ChatIcon,
      },
    isMobile && {
      name: 'Help & About',
      href: 'https://help.manifold.markets/',
      icon: BookOpenIcon,
    },
    isMobile &&
      loggedIn && { name: 'Sign out', icon: LogoutIcon, onClick: logout }
  )
