import {
  LogoutIcon,
  MoonIcon,
  SunIcon,
  SparklesIcon,
  QuestionMarkCircleIcon,
  LoginIcon,
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
import { ThemeContext } from 'web/hooks/theme-context'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin, firebaseLogout } from 'web/lib/firebase/users'
import { withTracking } from 'web/lib/service/analytics'
import { MobileAppsQRCodeDialog } from 'web/components/buttons/mobile-apps-qr-code-button'
import { SidebarSignUpButton } from 'web/components/buttons/sign-up-button'
import { ProfileSummary } from './love-profile-summary'
import { Item, SidebarItem } from './love-sidebar-item'
import ManifoldLoveLogo from '../manifold-love-logo'
import toast from 'react-hot-toast'

export default function Sidebar(props: {
  className?: string
  isMobile?: boolean
  navigationOptions: Item[]
  hideCreateQuestionButton?: boolean
}) {
  const { className, isMobile, hideCreateQuestionButton } = props
  const router = useRouter()
  const currentPage = router.pathname

  const user = useUser()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isAddFundsModalOpen, setIsAddFundsModalOpen] = useState(false)

  const { theme, changeTheme } = useContext(ThemeContext)

  const toggleTheme = () => {
    if (theme === 'dark') {
      toast('👻 Are you afraid of the dark?')
    }
    changeTheme(theme === 'auto' ? 'dark' : theme === 'dark' ? 'light' : 'auto')
  }
  const navOptions = props.navigationOptions

  const bottomNavOptions = bottomNav(!!user, theme, toggleTheme)

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
      <ManifoldLoveLogo />

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

const logout = async () => {
  // log out, and then reload the page, in case SSR wants to boot them out
  // of whatever logged-in-only area of the site they might be in
  await withTracking(firebaseLogout, 'sign out')()
  await Router.replace(Router.asPath)
}

const bottomNav = (
  loggedIn: boolean,
  theme: 'light' | 'dark' | 'auto',
  toggleTheme: () => void
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
    loggedIn && { name: 'Sign out', icon: LogoutIcon, onClick: logout }
  )
