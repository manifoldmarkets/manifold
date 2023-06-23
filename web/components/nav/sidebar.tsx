import {
  CashIcon,
  DeviceMobileIcon,
  HomeIcon,
  LogoutIcon,
  ScaleIcon,
  MoonIcon,
  SunIcon,
  SparklesIcon,
  StarIcon,
  UserGroupIcon,
  FireIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/outline'
// import { GiftIcon, MapIcon, MoonIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { buildArray } from 'common/util/array'
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
import { ProfileSummary } from './profile-summary'
import { SearchButton } from './search-button'
import { SidebarItem } from './sidebar-item'
import { getIsNative } from 'web/lib/native/is-native'
import { NewspaperIcon, SearchIcon } from '@heroicons/react/solid'
import { useIsFeedTest } from 'web/hooks/use-is-feed-test'

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

  const isFeed = !!useIsFeedTest()

  const navOptions = isMobile
    ? getMobileNav(() => setIsAddFundsModalOpen(!isAddFundsModalOpen), isFeed)
    : getDesktopNav(!!user, () => setIsModalOpen(true), isFeed)

  const bottomNavOptions = bottomNav(
    !!user,
    theme,
    useIsDarkMode(),
    toggleTheme
  )

  const createQuestionButton = user && !user.isBannedFromPosting && (
    <CreateQuestionButton key="create-question-button" />
  )

  return (
    <nav
      aria-label="Sidebar"
      className={clsx('flex h-screen flex-col xl:ml-2', className)}
    >
      <ManifoldLogo className="py-6" twoLine />

      {user === undefined && <div className="h-[56px]" />}

      {user && !isMobile && <ProfileSummary user={user} />}

      {!isMobile && <SearchButton className="mb-5" />}

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

        {createQuestionButton}
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

const getDesktopNav = (
  loggedIn: boolean,
  openDownloadApp: () => void,
  showQuestions: boolean
) => {
  if (loggedIn)
    return buildArray(
      { name: 'Home', href: '/home', icon: HomeIcon },
      showQuestions
        ? { name: 'Questions', href: '/questions', icon: ScaleIcon }
        : { name: 'News', href: '/news', icon: NewspaperIcon },
      {
        name: 'Notifications',
        href: `/notifications`,
        icon: NotificationsIcon,
      },
      {
        name: 'Leagues',
        href: '/leagues',
        icon: TrophyIcon,
      },
      {
        name: 'Groups',
        icon: UserGroupIcon,
        href: '/groups',
      }
    )

  return buildArray(
    { name: 'Home', href: '/', icon: HomeIcon },
    { name: 'Questions', href: '/questions', icon: ScaleIcon },
    { name: 'News', href: '/news', icon: NewspaperIcon },
    { name: 'App', onClick: openDownloadApp, icon: DeviceMobileIcon }
  )
}

// No sidebar when signed out
const getMobileNav = (toggleModal: () => void, isFeed: boolean) => {
  return buildArray(
    isFeed && { name: 'News', href: '/news', icon: NewspaperIcon },
    isFeed
      ? { name: 'Questions', href: '/questions', icon: ScaleIcon }
      : { name: 'Search', href: '/search', icon: SearchIcon },
    getIsNative() && { name: 'Swipe', href: '/swipe', icon: FireIcon },
    { name: 'Leagues', href: '/leagues', icon: TrophyIcon },
    {
      name: 'Groups',
      icon: UserGroupIcon,
      href: '/groups',
    },
    { name: 'Get mana', icon: CashIcon, onClick: toggleModal },
    { name: 'Share with friends', href: '/referrals', icon: StarIcon } // remove this and I will beat you — SG
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
    { name: 'About', href: '/about', icon: QuestionMarkCircleIcon },
    loggedIn && { name: 'Sign out', icon: LogoutIcon, onClick: logout }
  )
