import {
  ChatIcon,
  DeviceMobileIcon,
  LoginIcon,
  LogoutIcon,
  MoonIcon,
  QuestionMarkCircleIcon,
  SearchIcon,
  StarIcon,
  SunIcon,
} from '@heroicons/react/outline'
// import { PiTelevisionSimple } from 'react-icons/pi'
import clsx from 'clsx'
import { useState } from 'react'
import TrophyIcon from 'web/lib/icons/trophy-icon.svg'

import { buildArray } from 'common/util/array'
import { DAY_MS } from 'common/util/time'
import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { usePathname, useRouter } from 'next/navigation'
import { IoCompassOutline } from 'react-icons/io5'
import { AppBadgesOrGetAppButton } from 'web/components/buttons/app-badges-or-get-app-button'
import { CreateQuestionButton } from 'web/components/buttons/create-question-button'
import { NotificationsIcon } from 'web/components/notifications-icon'
import { useAdminOrMod } from 'web/hooks/use-admin'
import { useTheme } from 'web/hooks/use-theme'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin, firebaseLogout } from 'web/lib/firebase/users'
import { withTracking } from 'web/lib/service/analytics'
import { MobileAppsQRCodeDialog } from '../buttons/mobile-apps-qr-code-button'
import { SidebarSignUpButton } from '../buttons/sign-up-button'
import { Col } from '../layout/col'
import { AddFundsButton } from '../profile/add-funds-button'
import { ReportsIcon } from '../reports-icon'
import { LiveTVIcon } from '../tv-icon'
import { useTVIsLive } from '../tv/tv-schedule'
import { ManifoldLogo } from './manifold-logo'
import { ProfileSummary } from './profile-summary'
import { NavItem, SidebarItem } from './sidebar-item'

export default function Sidebar(props: {
  className?: string
  isMobile?: boolean
}) {
  const { className, isMobile } = props
  const router = useRouter()
  const currentPage = usePathname() ?? undefined
  const user = useUser()
  const isAdminOrMod = useAdminOrMod()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isAddFundsModalOpen, setIsAddFundsModalOpen] = useState(false)

  const { theme, setTheme } = useTheme()

  const toggleTheme = () => {
    setTheme(theme === 'auto' ? 'dark' : theme === 'dark' ? 'light' : 'auto')
  }

  const isNewUser = !!user && user.createdTime > Date.now() - DAY_MS

  const isLiveTV = useTVIsLive(10)

  const navOptions = isMobile
    ? getMobileNav(() => setIsAddFundsModalOpen(!isAddFundsModalOpen), {
        isNewUser,
        isLiveTV,
        isAdminOrMod: isAdminOrMod,
      })
    : getDesktopNav(!!user, () => setIsModalOpen(true), {
        isNewUser,
        isLiveTV,
        isAdminOrMod: isAdminOrMod,
      })

  const bottomNavOptions = bottomNav(
    !!user,
    theme,
    toggleTheme,
    router,
    isMobile
  )

  const createMarketButton = user && !user.isBannedFromPosting && (
    <CreateQuestionButton
      key="create-market-button"
      className={'mt-4 w-full'}
    />
  )

  const addFundsButton = user && (
    <AddFundsButton
      userId={user.id}
      className="w-full whitespace-nowrap"
      size="xl"
    />
  )

  return (
    <nav
      aria-label="Sidebar"
      className={clsx('flex h-screen flex-col', className)}
    >
      <ManifoldLogo className="pb-3 pt-6" />

      {user && !isMobile && <ProfileSummary user={user} className="mb-3" />}

      <div className="mb-4 flex flex-col gap-1">
        {navOptions.map((item) => (
          <SidebarItem key={item.name} item={item} currentPage={currentPage} />
        ))}

        <MobileAppsQRCodeDialog
          key="mobile-apps-qr-code"
          isModalOpen={isModalOpen}
          setIsModalOpen={setIsModalOpen}
        />

        {!user && <SidebarSignUpButton />}

        <Col className="gap-2">
          {createMarketButton}
          {addFundsButton}
        </Col>
      </div>
      <div
        className={clsx('mb-6 mt-auto flex flex-col gap-1', isMobile && 'pb-8')}
      >
        {!!user && <AppBadgesOrGetAppButton hideOnDesktop className="mb-2" />}
        {bottomNavOptions.map((item) => (
          <SidebarItem key={item.name} item={item} currentPage={currentPage} />
        ))}
      </div>
    </nav>
  )
}

const getDesktopNav = (
  loggedIn: boolean,
  openDownloadApp: () => void,
  options: { isNewUser: boolean; isLiveTV?: boolean; isAdminOrMod: boolean }
) => {
  const { isLiveTV } = options
  if (loggedIn)
    return buildArray(
      { name: 'Browse', href: '/home', icon: SearchIcon },
      {
        name: 'Explore',
        href: '/explore',
        icon: IoCompassOutline,
        iconClassName: '!h-[1.6rem] !w-[1.6rem] !mr-[0.65rem]',
      },
      isLiveTV && {
        name: 'TV',
        href: '/tv',
        icon: LiveTVIcon,
      },
      {
        name: 'Notifications',
        href: `/notifications`,
        icon: NotificationsIcon,
      },
      { name: 'Leagues', href: '/leagues', icon: TrophyIcon },
      {
        name: 'Forum',
        href: '/posts',
        icon: ChatIcon,
      },

      options.isAdminOrMod && {
        name: 'Reports',
        href: '/reports',
        icon: ReportsIcon,
      }
    )

  return buildArray(
    { name: 'Browse', href: '/', icon: SearchIcon },
    { name: 'About', href: '/about', icon: QuestionMarkCircleIcon },
    { name: 'App', onClick: openDownloadApp, icon: DeviceMobileIcon }
  )
}

const getMobileNav = (
  toggleModal: () => void,
  options: { isNewUser: boolean; isLiveTV?: boolean; isAdminOrMod: boolean }
) => {
  const { isAdminOrMod, isLiveTV } = options

  return buildArray<NavItem>(
    { name: 'Leagues', href: '/leagues', icon: TrophyIcon },
    { name: 'Forum', href: '/posts', icon: ChatIcon },
    {
      name: 'Share with friends',
      href: '/referrals',
      icon: StarIcon,
    },
    isLiveTV && {
      name: 'TV',
      href: '/tv',
      icon: LiveTVIcon,
    },
    isAdminOrMod && {
      name: 'Reports',
      href: '/reports',
      icon: ReportsIcon,
    }
  )
}

const bottomNav = (
  loggedIn: boolean,
  theme: 'light' | 'dark' | 'auto',
  toggleTheme: () => void,
  router: AppRouterInstance,
  isMobile: boolean | undefined
) =>
  buildArray<NavItem>(
    loggedIn && { name: 'About', href: '/about', icon: QuestionMarkCircleIcon },
    !isMobile && {
      name: 'Share with friends',
      href: '/referrals',
      icon: StarIcon,
    },
    {
      name: theme ?? 'auto',
      children:
        theme === 'light' ? (
          'Light'
        ) : theme === 'dark' ? (
          'Dark'
        ) : (
          <>
            <span className="hidden dark:inline">Dark</span>
            <span className="inline dark:hidden">Light</span> (auto)
          </>
        ),
      icon: ({ className, ...props }) => (
        <>
          <MoonIcon
            className={clsx(className, 'hidden dark:block')}
            {...props}
          />
          <SunIcon
            className={clsx(className, 'block dark:hidden')}
            {...props}
          />
        </>
      ),
      onClick: toggleTheme,
    },
    loggedIn && {
      name: 'Sign out',
      icon: LogoutIcon,
      onClick: async () => {
        await withTracking(firebaseLogout, 'sign out')()
        await router.refresh()
      },
    },
    !loggedIn && { name: 'Sign in', icon: LoginIcon, onClick: firebaseLogin }
  )
