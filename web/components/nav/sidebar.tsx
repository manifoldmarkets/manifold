import {
  BookOpenIcon,
  CashIcon,
  DeviceMobileIcon,
  HomeIcon,
  LogoutIcon,
  ScaleIcon,
  SearchIcon,
  MapIcon,
  MoonIcon,
  SpeakerphoneIcon,
  SunIcon,
  SparklesIcon,
  StarIcon,
} from '@heroicons/react/outline'
// import { GiftIcon, MapIcon, MoonIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { buildArray } from 'common/util/array'
import { formatMoney } from 'common/util/format'
import { capitalize } from 'lodash'
import Router, { useRouter } from 'next/router'
import { useContext, useState } from 'react'
import { AddFundsModal } from 'web/components/add-funds-modal'
import { AppBadgesOrGetAppButton } from 'web/components/buttons/app-badges-or-get-app-button'
import { CreateQuestionButton } from 'web/components/buttons/create-question-button'
import NotificationsIcon from 'web/components/notifications-icon'
import { DarkModeContext, useIsDarkMode } from 'web/hooks/dark-mode-context'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogout } from 'web/lib/firebase/users'
import TrophyIcon from 'web/lib/icons/trophy-icon'
import { withTracking } from 'web/lib/service/analytics'
import { MobileAppsQRCodeDialog } from '../buttons/mobile-apps-qr-code-button'
import { SignInButton } from '../buttons/sign-in-button'
import { ManifoldLogo } from './manifold-logo'
import { ProfileSummary } from './profile-menu'
import { SearchButton } from './search-button'
import { SidebarItem } from './sidebar-item'
import RectangleGroupIcon from 'web/lib/icons/reactangle-group-icon'

export default function Sidebar(props: {
  className?: string
  isMobile?: boolean
}) {
  const { className, isMobile } = props
  const router = useRouter()
  const currentPage = router.pathname

  const user = useUser()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isAddFundsModalOpen, setIsAddFundsModalOpen] = useState(false)

  const { theme, changeTheme } = useContext(DarkModeContext)

  const toggleTheme = () => {
    changeTheme(theme === 'auto' ? 'dark' : theme === 'dark' ? 'light' : 'auto')
  }

  const navOptions = isMobile
    ? getMobileNav(() => setIsAddFundsModalOpen(!isAddFundsModalOpen))
    : getDesktopNav(!!user, () => setIsModalOpen(true))

  const bottomNavOptions = bottomNav(
    !!user,
    theme,
    useIsDarkMode(),
    toggleTheme
  )

  const createMarketButton = user && !user.isBannedFromPosting && (
    <CreateQuestionButton key="create-market-button" />
  )

  return (
    <nav
      aria-label="Sidebar"
      className={clsx('flex h-screen flex-col xl:ml-2', className)}
    >
      <ManifoldLogo className="py-6" twoLine />

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

        {user === null && <SignInButton />}

        {createMarketButton}
      </div>
      <div className="mt-auto mb-6 flex flex-col gap-1">
        {user !== null && <AppBadgesOrGetAppButton hideOnDesktop={true} />}
        {bottomNavOptions.map((item) => (
          <SidebarItem key={item.name} item={item} currentPage={currentPage} />
        ))}
      </div>
      <AddFundsModal
        open={isAddFundsModalOpen}
        setOpen={setIsAddFundsModalOpen}
      />
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
      {
        name: 'Leaderboards',
        href: '/leaderboards',
        icon: TrophyIcon,
      },
      {
        name: 'Groups',
        icon: RectangleGroupIcon,
        href: '/groups',
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

// No sidebar when signed out
const getMobileNav = (toggleModal: () => void) => {
  return buildArray(
    { name: 'Markets', href: '/markets', icon: ScaleIcon },
    { name: 'Leaderboards', href: '/leaderboards', icon: TrophyIcon },

    { name: 'Get mana', icon: CashIcon, onClick: toggleModal },
    { name: 'Share with friends', href: '/referrals', icon: StarIcon }, // remove this and I will beat you — SG
    {
      name: `Ads - earn ${formatMoney(5)} per view!`,
      icon: SpeakerphoneIcon,
      href: '/ad',
    },
    {
      name: 'Groups',
      icon: RectangleGroupIcon,
      href: '/groups',
    }
  )
}

const bottomNav = (
  loggedIn: boolean,
  theme: 'light' | 'dark' | 'auto',
  isDarkMode: boolean,
  toggleTheme: () => void
) =>
  buildArray(
    {
      name:
        theme === 'auto'
          ? `Auto (${isDarkMode ? 'dark' : 'light'})`
          : capitalize(theme),
      icon:
        theme === 'light'
          ? SunIcon
          : theme === 'dark'
          ? MoonIcon
          : SparklesIcon,
      onClick: toggleTheme,
    },
    { name: 'Sitemap', href: '/sitemap', icon: MapIcon },
    loggedIn && { name: 'Sign out', icon: LogoutIcon, onClick: logout }
  )
