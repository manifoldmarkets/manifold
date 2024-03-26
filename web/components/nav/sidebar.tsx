import {
  CashIcon,
  DeviceMobileIcon,
  HomeIcon,
  LogoutIcon,
  MoonIcon,
  SunIcon,
  StarIcon,
  QuestionMarkCircleIcon,
  NewspaperIcon,
  SearchIcon,
  LightningBoltIcon,
  LoginIcon,
  TemplateIcon,
} from '@heroicons/react/outline'
import clsx from 'clsx'
import { buildArray } from 'common/util/array'
import { usePathname, useRouter } from 'next/navigation'
import { AddFundsModal } from 'web/components/add-funds-modal'
import { AppBadgesOrGetAppButton } from 'web/components/buttons/app-badges-or-get-app-button'
import { CreateQuestionButton } from 'web/components/buttons/create-question-button'
import { NotificationsIcon } from 'web/components/notifications-icon'
import { useTheme } from 'web/hooks/use-theme'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin, firebaseLogout } from 'web/lib/firebase/users'
import TrophyIcon from 'web/lib/icons/trophy-icon.svg'
import { withTracking } from 'web/lib/service/analytics'
import { MobileAppsQRCodeDialog } from '../buttons/mobile-apps-qr-code-button'
import { SidebarSignUpButton } from '../buttons/sign-up-button'
import { ManifoldLogo } from './manifold-logo'
import { ProfileSummary } from './profile-summary'
import { NavItem, SidebarItem } from './sidebar-item'
import { PrivateMessagesIcon } from 'web/components/messaging/messages-icon'
import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { useState } from 'react'
import { GiCapitol } from 'react-icons/gi'
import { PiTelevisionSimple } from 'react-icons/pi'

export default function Sidebar(props: {
  className?: string
  isMobile?: boolean
  navigationOptions?: NavItem[]
  hideCreateQuestionButton?: boolean
}) {
  const { className, isMobile, hideCreateQuestionButton } = props
  const router = useRouter()
  const currentPage = usePathname() ?? undefined

  const user = useUser()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isAddFundsModalOpen, setIsAddFundsModalOpen] = useState(false)

  const { theme, setTheme } = useTheme()

  const toggleTheme = () => {
    setTheme(theme === 'auto' ? 'dark' : theme === 'dark' ? 'light' : 'auto')
  }

  const navOptions = props.navigationOptions?.length
    ? props.navigationOptions
    : isMobile
    ? getMobileNav(() => setIsAddFundsModalOpen(!isAddFundsModalOpen))
    : getDesktopNav(!!user, () => setIsModalOpen(true))

  const bottomNavOptions = bottomNav(!!user, theme, toggleTheme, router)

  const createMarketButton = !hideCreateQuestionButton &&
    user &&
    !user.isBannedFromPosting && (
      <CreateQuestionButton
        key="create-market-button"
        className={'mt-4 w-full'}
      />
    )

  return (
    <nav
      aria-label="Sidebar"
      className={clsx('flex h-screen flex-col', className)}
    >
      <ManifoldLogo className="pb-3 pt-6" />

      {user === undefined && <div className="h-[56px]" />}

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

        {user === null && <SidebarSignUpButton />}

        {createMarketButton}
      </div>
      <div
        className={clsx('mb-6 mt-auto flex flex-col gap-1', isMobile && 'pb-8')}
      >
        {user !== null && (
          <AppBadgesOrGetAppButton hideOnDesktop className="mb-2" />
        )}
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

const getDesktopNav = (loggedIn: boolean, openDownloadApp: () => void) => {
  if (loggedIn)
    return buildArray(
      { name: 'Home', href: '/home', icon: HomeIcon },
      {
        name: 'Browse',
        href: '/browse/for-you',
        icon: SearchIcon,
      },
      {
        name: 'US Politics',
        href: '/politics',
        icon: GiCapitol,
      },
      {
        name: 'TV',
        href: '/tv',
        icon: PiTelevisionSimple,
      },
      {
        name: 'Notifications',
        href: `/notifications`,
        icon: NotificationsIcon,
      },
      {
        name: 'Messages',
        href: '/messages',
        icon: PrivateMessagesIcon,
      }
      // { name: 'Leagues', href: '/leagues', icon: TrophyIcon }
      // Disable for now.
      // { name: 'Dashboards', href: '/dashboard', icon: TemplateIcon }
    )

  return buildArray(
    {
      name: 'US Politics',
      href: '/politics',
      icon: GiCapitol,
    },
    { name: 'News', href: '/news', icon: NewspaperIcon },
    { name: 'Browse', href: '/browse', icon: SearchIcon },
    { name: 'About', href: '/about', icon: QuestionMarkCircleIcon },
    { name: 'App', onClick: openDownloadApp, icon: DeviceMobileIcon }
  )
}

// No sidebar when signed out
const getMobileNav = (toggleModal: () => void) => {
  return buildArray<NavItem>(
    {
      name: 'US Politics',
      href: '/politics',
      icon: GiCapitol,
    },
    // { name: 'Leagues', href: '/leagues', icon: TrophyIcon },
    { name: 'TV', href: '/tv', icon: PiTelevisionSimple },
    { name: 'Messages', href: '/messages', icon: PrivateMessagesIcon },
    { name: 'Dashboards', href: '/dashboard', icon: TemplateIcon },
    { name: 'Site activity', href: '/live', icon: LightningBoltIcon },
    { name: 'Get mana', icon: CashIcon, onClick: toggleModal },
    { name: 'Share with friends', href: '/referrals', icon: StarIcon } // remove this and I will beat you — SG
  )
}

const bottomNav = (
  loggedIn: boolean,
  theme: 'light' | 'dark' | 'auto',
  toggleTheme: () => void,
  router: AppRouterInstance
) =>
  buildArray<NavItem>(
    !loggedIn && { name: 'Sign in', icon: LoginIcon, onClick: firebaseLogin },
    loggedIn && { name: 'About', href: '/about', icon: QuestionMarkCircleIcon },
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
    }
  )
