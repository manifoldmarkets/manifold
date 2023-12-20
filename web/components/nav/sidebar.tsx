import {
  CashIcon,
  DeviceMobileIcon,
  HomeIcon,
  LogoutIcon,
  MoonIcon,
  SunIcon,
  SparklesIcon,
  StarIcon,
  QuestionMarkCircleIcon,
  NewspaperIcon,
  SearchIcon,
  LightningBoltIcon,
  LoginIcon,
  TemplateIcon,
} from '@heroicons/react/outline'
// import { GiftIcon, MapIcon, MoonIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { buildArray } from 'common/util/array'
import { capitalize } from 'lodash'
import { usePathname, useRouter } from 'next/navigation'
import { useContext, useState } from 'react'
import { AddFundsModal } from 'web/components/add-funds-modal'
import { AppBadgesOrGetAppButton } from 'web/components/buttons/app-badges-or-get-app-button'
import { CreateQuestionButton } from 'web/components/buttons/create-question-button'
import { NotificationsIcon } from 'web/components/notifications-icon'
import { ThemeContext } from 'web/hooks/theme-context'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin, firebaseLogout } from 'web/lib/firebase/users'
import TrophyIcon from 'web/lib/icons/trophy-icon.svg'
import { withTracking } from 'web/lib/service/analytics'
import { MobileAppsQRCodeDialog } from '../buttons/mobile-apps-qr-code-button'
import { SidebarSignUpButton } from '../buttons/sign-up-button'
import { ManifoldLogo } from './manifold-logo'
import { ProfileSummary } from './profile-summary'
import { Item, SidebarItem } from './sidebar-item'
import { PrivateMessagesIcon } from 'web/components/messaging/messages-icon'
import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'

export default function Sidebar(props: {
  className?: string
  isMobile?: boolean
  navigationOptions?: Item[]
  hideCreateQuestionButton?: boolean
}) {
  const { className, isMobile, hideCreateQuestionButton } = props
  const router = useRouter()
  const currentPage = usePathname() ?? undefined

  const user = useUser()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isAddFundsModalOpen, setIsAddFundsModalOpen] = useState(false)

  const { theme, changeTheme } = useContext(ThemeContext)

  const toggleTheme = () => {
    changeTheme(theme === 'auto' ? 'dark' : theme === 'dark' ? 'light' : 'auto')
  }
  const navOptions = props.navigationOptions?.length
    ? props.navigationOptions
    : isMobile
    ? getMobileNav(() => setIsAddFundsModalOpen(!isAddFundsModalOpen))
    : getDesktopNav(!!user, () => setIsModalOpen(true), true)

  const bottomNavOptions = bottomNav(!!user, theme, toggleTheme, router)

  const createMarketButton = !hideCreateQuestionButton &&
    user &&
    !user.isBannedFromPosting && (
      <CreateQuestionButton key="create-market-button" className={'mt-4'} />
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
      <div className="mb-6 mt-auto flex flex-col gap-1">
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

const getDesktopNav = (
  loggedIn: boolean,
  openDownloadApp: () => void,
  showMarkets: boolean
) => {
  if (loggedIn)
    return buildArray(
      { name: 'Home', href: '/home', icon: HomeIcon },
      showMarkets
        ? {
            name: 'Browse',
            href: '/browse?topic=for-you',
            icon: SearchIcon,
          }
        : { name: 'News', href: '/news', icon: NewspaperIcon },
      {
        name: 'Notifications',
        href: `/notifications`,
        icon: NotificationsIcon,
      },
      {
        name: 'Messages',
        href: '/messages',
        icon: PrivateMessagesIcon,
      },
      { name: 'Leagues', href: '/leagues', icon: TrophyIcon }
      // Disable for now.
      // { name: 'Dashboards', href: '/dashboard', icon: TemplateIcon }
    )

  return buildArray(
    { name: 'Browse', href: '/browse', icon: SearchIcon },
    { name: 'News', href: '/news', icon: NewspaperIcon },
    { name: 'About', href: '/about', icon: QuestionMarkCircleIcon },
    { name: 'App', onClick: openDownloadApp, icon: DeviceMobileIcon }
  )
}

// No sidebar when signed out
const getMobileNav = (toggleModal: () => void) => {
  return buildArray(
    { name: 'Leagues', href: '/leagues', icon: TrophyIcon },
    { name: 'Dashboards', href: '/dashboard', icon: TemplateIcon },
    { name: 'Messages', href: '/messages', icon: PrivateMessagesIcon },
    { name: 'Live', href: '/live', icon: LightningBoltIcon },
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
  buildArray(
    !loggedIn && { name: 'Sign in', icon: LoginIcon, onClick: firebaseLogin },
    loggedIn && { name: 'About', href: '/about', icon: QuestionMarkCircleIcon },
    {
      name: theme === 'auto' ? 'Auto' : capitalize(theme),
      icon:
        theme === 'light'
          ? SunIcon
          : theme === 'dark'
          ? MoonIcon
          : SparklesIcon,
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
