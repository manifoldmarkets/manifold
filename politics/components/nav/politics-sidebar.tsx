'use client'
import { HeartIcon, LoginIcon, LogoutIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { buildArray } from 'common/util/array'
import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { usePathname, useRouter } from 'next/navigation'
import { useContext, useState } from 'react'
import { AddFundsModal } from 'web/components/add-funds-modal'
import { Button, ColorType, SizeType } from 'web/components/buttons/button'
import { MobileAppsQRCodeDialog } from 'web/components/buttons/mobile-apps-qr-code-button'
import { ThemeContext } from 'web/hooks/theme-context'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin, firebaseLogout } from 'web/lib/firebase/users'
import { withTracking } from 'web/lib/service/analytics'
import { ProfileSummary } from './politics-profile-summary'
import { Item, SidebarItem } from './politics-sidebar-item'

export default function Sidebar(props: {
  className?: string
  isMobile?: boolean
  navigationOptions: Item[]
}) {
  const { className, isMobile } = props
  const currentPage = usePathname() ?? undefined

  const user = useUser()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isAddFundsModalOpen, setIsAddFundsModalOpen] = useState(false)

  const { theme, changeTheme } = useContext(ThemeContext)

  const toggleTheme = () => {
    changeTheme(theme === 'auto' ? 'dark' : theme === 'dark' ? 'light' : 'auto')
  }
  const navOptions = props.navigationOptions
  const router = useRouter()
  const bottomNavOptions = bottomNav(!!user, theme, toggleTheme, router)

  return (
    <nav
      aria-label="Sidebar"
      className={clsx('flex h-screen flex-col', className)}
    >
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

        {user === null && (
          <SignUpButton className="mt-4" text="Create a profile" />
        )}
      </div>
      <div className="mb-6 mt-auto flex flex-col gap-1">
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

const bottomNav = (
  loggedIn: boolean,
  theme: 'light' | 'dark' | 'auto',
  toggleTheme: () => void,
  router: AppRouterInstance
) => {
  return buildArray(
    { name: 'Share with friends', href: '/referrals', icon: HeartIcon },
    !loggedIn && { name: 'Sign in', icon: LoginIcon, onClick: firebaseLogin },
    loggedIn && {
      name: 'Sign out',
      icon: LogoutIcon,
      onClick: async () => {
        await withTracking(firebaseLogout, 'sign out')()
        await router.refresh()
      },
    }
  )
}
export const SignUpButton = (props: {
  text?: string
  className?: string
  color?: ColorType
  size?: SizeType
}) => {
  const { className, text, color, size } = props

  return (
    <Button
      color={color ?? 'gradient'}
      size={size ?? 'xl'}
      onClick={firebaseLogin}
      className={clsx('w-full', className)}
    >
      {text ?? 'Sign up now'}
    </Button>
  )
}

export const SignUpAsMatchmaker = (props: {
  className?: string
  size?: SizeType
}) => {
  const { className, size } = props

  return (
    <Button
      color={'indigo-outline'}
      size={size ?? 'md'}
      onClick={firebaseLogin}
      className={clsx('w-full', className)}
    >
      Sign up as matchmaker
    </Button>
  )
}
