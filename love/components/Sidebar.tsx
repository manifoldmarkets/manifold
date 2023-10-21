import clsx from 'clsx'
import { useRouter } from 'next/router'
import { useContext, useState } from 'react'
import { AddFundsModal } from 'web/components/add-funds-modal'
import { AppBadgesOrGetAppButton } from 'web/components/buttons/app-badges-or-get-app-button'
import { CreateQuestionButton } from 'web/components/buttons/create-question-button'
import { DarkModeContext } from 'web/hooks/dark-mode-context'
import { useUser } from 'web/hooks/use-user'
import { MobileAppsQRCodeDialog } from 'web/components/buttons/mobile-apps-qr-code-button'
import { SidebarSignUpButton } from 'web/components/buttons/sign-up-button'
import { ProfileSummary } from 'web/components/nav/profile-summary'
import { Item, SidebarItem } from 'web/components/nav/sidebar-item'
import { getMobileNav, getDesktopNav, bottomNav } from './love-sidebar'

export default function Sidebar(props: {
  className?: string
  isMobile?: boolean
  navigationOptions?: Item[]
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
  const navOptions = props.navigationOptions?.length
    ? props.navigationOptions
    : isMobile
    ? getMobileNav(() => setIsAddFundsModalOpen(!isAddFundsModalOpen))
    : getDesktopNav(!!user, () => setIsModalOpen(true), true)

  const bottomNavOptions = bottomNav(!!user, theme, toggleTheme)

  const createMarketButton = user && !user.isBannedFromPosting && (
    <CreateQuestionButton key="create-market-button" className={'mt-4'} />
  )

  return (
    <nav
      aria-label="Sidebar"
      className={clsx('flex h-screen flex-col', className)}
    >
      {/* <ManifoldLogo className="pb-3 pt-6" /> */}
      <Image
        className="mx-auto my-auto opacity-40"
        height={200}
        width={200}
        src={'/money-bag.svg'}
        alt={''}
      />

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
