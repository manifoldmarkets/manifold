import React, { useState } from 'react'
import {
  CashIcon,
  HomeIcon,
  SearchIcon,
  BookOpenIcon,
  LogoutIcon,
  HeartIcon,
  LightningBoltIcon,
  DeviceMobileIcon,
  ScaleIcon,
  UserGroupIcon,
  TicketIcon,
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
import { SignInButton } from '../buttons/sign-in-button'
import { SidebarItem } from './sidebar-item'
import { MoreButton } from './more-button'
import { Row } from '../layout/row'
import { AppBadgesOrGetAppButton } from 'web/components/buttons/app-badges-or-get-app-button'
import { SearchButton } from './search-button'
import { MobileAppsQRCodeDialog } from '../buttons/mobile-apps-qr-code-button'
import TrophyIcon from 'web/lib/icons/trophy-icon'
import DiscordOutlineIcon from 'web/lib/icons/discord-outline-icon'
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
  const [isModalOpen, setIsModalOpen] = useState(false)

  const navOptions = isMobile
    ? getMobileNav()
    : getDesktopNav(!!user, () => setIsModalOpen(true))

  const bottomNavOptions = bottomNav(!!isMobile, !!user)

  const createMarketButton = user && !user.isBannedFromPosting && (
    <CreateQuestionButton key="create-market-button" />
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

      {user && !isMobile && <ProfileSummary user={user} />}

      {user && !isMobile && <SearchButton className="mb-5" />}

      <div className="mb-4 flex flex-col gap-1">
        {navOptions.map((item) => (
          <SidebarItem key={item.name} item={item} currentPage={currentPage} />
        ))}

        <MobileAppsQRCodeDialog
          key="mobile-apps-qr-code"
          isModalOpen={isModalOpen}
          setIsModalOpen={setIsModalOpen}
        />

        {user === null && (
          <SignInButton key="sign-in-button" className="mt-3" />
        )}

        {user && !isMobile && (
          <MenuButton
            key="menu-button"
            menuItems={getMoreDesktopNavigation(!!user)}
            buttonContent={<MoreButton />}
          />
        )}

        {createMarketButton}
      </div>
      <div className="mt-auto mb-6 flex flex-col gap-1">
        {user !== null && <AppBadgesOrGetAppButton hideOnDesktop={true} />}
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

const getDesktopNav = (loggedIn: boolean, openDownloadApp: () => void) => {
  if (loggedIn)
    return buildArray(
      { name: 'Home', href: '/home', icon: HomeIcon },
      { name: 'Markets', href: '/markets', icon: ScaleIcon },
      {
        name: 'Notifications',
        href: `/notifications`,
        icon: NotificationsIcon,
      },
      !IS_PRIVATE_MANIFOLD && {
        name: 'Leaderboards',
        href: '/leaderboards',
        icon: TrophyIcon,
      }
    )

  return buildArray(
    { name: 'Home', href: '/', icon: HomeIcon },
    { name: 'Markets', href: '/markets', icon: ScaleIcon },
    {
      name: 'About',
      href: '/?showHelpModal=true',
      icon: BookOpenIcon,
    },
    { name: 'App', onClick: openDownloadApp, icon: DeviceMobileIcon }
  )
}

function getMoreDesktopNavigation(loggedIn: boolean) {
  if (IS_PRIVATE_MANIFOLD) {
    return [{ name: 'Leaderboards', href: '/leaderboards', icon: TrophyIcon }]
  }

  return buildArray(
    { name: 'Groups', href: '/groups' },
    { name: 'Referrals', href: '/referrals' },
    { name: 'Charity', href: '/charity' },
    { name: 'Labs', href: '/labs' },
    // { name: 'Blog', href: 'https://news.manifold.markets' },
    { name: 'Discord', href: 'https://discord.gg/eHQBNBqXuh' },
    {
      name: 'Help & About',
      href: 'https://help.manifold.markets/',
    },
    loggedIn && { name: 'Sign out', onClick: logout }
  )
}

// No sidebar when signed out
const getMobileNav = () => {
  if (IS_PRIVATE_MANIFOLD) {
    return [{ name: 'Leaderboards', href: '/leaderboards', icon: TrophyIcon }]
  }
  return buildArray(
    { name: 'Search', href: '/find', icon: SearchIcon },
    { name: 'Live', href: '/live', icon: LightningBoltIcon },
    { name: 'Leaderboards', href: '/leaderboards', icon: TrophyIcon },
    { name: 'Get mana', href: '/add-funds', icon: CashIcon },
    {
      name: 'Groups',
      href: '/groups',
      icon: UserGroupIcon,
    },
    { name: 'Charity', href: '/charity', icon: HeartIcon },
    { name: 'Referrals', href: '/referrals', icon: TicketIcon }
  )
}

const bottomNav = (isMobile: boolean, loggedIn: boolean) =>
  buildArray(
    loggedIn &&
      isMobile && {
        name: 'Help & About',
        href: 'https://help.manifold.markets/',
        icon: BookOpenIcon,
      },
    !IS_PRIVATE_MANIFOLD &&
      loggedIn &&
      isMobile && {
        name: 'Discord',
        href: 'https://discord.gg/eHQBNBqXuh',
        icon: DiscordOutlineIcon,
      },

    isMobile &&
      loggedIn && { name: 'Sign out', icon: LogoutIcon, onClick: logout }
  )
