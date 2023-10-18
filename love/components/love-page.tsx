import clsx from 'clsx'
import { ReactNode, useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { GoogleOneTapLogin } from 'web/lib/firebase/google-onetap-login'
import { useTracking } from 'web/hooks/use-tracking'
import { Col } from 'web/components/layout/col'
import { BottomNavBar } from 'web/components/nav/bottom-nav-bar'
import Sidebar from 'web/components/nav/sidebar'
import { useUser } from 'web/hooks/use-user'
import { User } from 'common/user'
import {
  HomeIcon as SolidHomeIcon,
  QuestionMarkCircleIcon,
  SearchIcon,
  UserCircleIcon,
} from '@heroicons/react/solid'
import {
  NotificationsIcon,
  SolidNotificationsIcon,
} from 'web/components/notifications-icon'
import { firebaseLogin } from 'web/lib/firebase/users'
import { buildArray } from 'common/util/array'
import {
  CashIcon,
  DeviceMobileIcon,
  StarIcon,
  HomeIcon,
} from '@heroicons/react/outline'
import { PrivateMessagesIcon } from 'web/components/messaging/messages-icon'
import { AddFundsModal } from 'web/components/add-funds-modal'
import { MobileAppsQRCodeDialog } from 'web/components/buttons/mobile-apps-qr-code-button'
import { NOTIFICATIONS_TO_IGNORE } from 'love/pages/notifications'

export function LovePage(props: {
  trackPageView: string | false
  trackPageProps?: Record<string, any>
  className?: string
  children?: ReactNode
  hideSidebar?: boolean
  hideBottomBar?: boolean
}) {
  const {
    trackPageView,
    trackPageProps,
    children,
    className,
    hideSidebar,
    hideBottomBar,
  } = props
  const user = useUser()
  const isMobile = useIsMobile()
  const navigationOptions = user
    ? getBottomNavigation(user)
    : signedOutNavigation()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const sidebarNavigationOptions = user
    ? isMobile
      ? getSidebarNavigation(() => setIsAddFundsModalOpen(true))
      : getDesktopNav(!!user, () => setIsModalOpen(true))
    : []
  // eslint-disable-next-line react-hooks/rules-of-hooks
  trackPageView && useTracking(`view ${trackPageView}`, trackPageProps)
  const [isAddFundsModalOpen, setIsAddFundsModalOpen] = useState(false)

  return (
    <>
      <GoogleOneTapLogin className="fixed bottom-12 right-4 z-[1000]" />
      <Col
        className={clsx(
          'pb-[58px] lg:pb-0', // bottom bar padding
          'text-ink-1000 mx-auto min-h-screen w-full max-w-[1440px] lg:grid lg:grid-cols-12'
        )}
      >
        <Toaster
          position={isMobile ? 'bottom-center' : 'top-center'}
          containerClassName="!bottom-[70px]"
        />
        {hideSidebar ? (
          <div className="lg:col-span-2 lg:flex" />
        ) : (
          <Sidebar
            navigationOptions={sidebarNavigationOptions}
            className="sticky top-0 hidden self-start px-2 lg:col-span-2 lg:flex"
          />
        )}
        <main
          className={clsx(
            'flex flex-1 flex-col lg:mt-6 xl:px-2',
            'col-span-8',
            className
          )}
        >
          {children}
        </main>
      </Col>
      {!hideBottomBar && (
        <BottomNavBar
          sidebarNavigationOptions={sidebarNavigationOptions}
          navigationOptions={navigationOptions}
        />
      )}
      <AddFundsModal
        open={isAddFundsModalOpen}
        setOpen={setIsAddFundsModalOpen}
      />
      <MobileAppsQRCodeDialog
        key="mobile-apps-qr-code"
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
      />
    </>
  )
}

function getBottomNavigation(user: User) {
  return buildArray(
    { name: 'Home', href: '/home', icon: SolidHomeIcon },
    { name: 'Browse', href: '/profiles', icon: SearchIcon },
    {
      name: 'Profile',
      href: `/${user.username}`,
    },
    {
      name: 'Notifs',
      href: `/notifications`,
      icon: (props) => (
        <SolidNotificationsIcon
          {...props}
          ignoreTypes={NOTIFICATIONS_TO_IGNORE}
        />
      ),
    }
  )
}

const signedOutNavigation = () => [
  { name: 'Browse', href: '/profiles', icon: SearchIcon },
  { name: 'About', href: '/about', icon: QuestionMarkCircleIcon },
  { name: 'Sign in', onClick: firebaseLogin, icon: UserCircleIcon },
]
const getDesktopNav = (loggedIn: boolean, openDownloadApp: () => void) => {
  if (loggedIn)
    return buildArray(
      { name: 'Home', href: '/home', icon: HomeIcon },
      { name: 'Browse', href: '/profiles', icon: SearchIcon },
      {
        name: 'Notifications',
        href: `/notifications`,
        icon: (props) => (
          <NotificationsIcon {...props} ignoreTypes={NOTIFICATIONS_TO_IGNORE} />
        ),
      },
      {
        name: 'Messages',
        href: '/messages',
        icon: PrivateMessagesIcon,
      }
    )

  return buildArray(
    { name: 'Browse', href: '/profiles', icon: SearchIcon },
    { name: 'About', href: '/about', icon: QuestionMarkCircleIcon },
    { name: 'App', onClick: openDownloadApp, icon: DeviceMobileIcon }
  )
}

// No sidebar when signed out
const getSidebarNavigation = (toggleModal: () => void) => {
  return buildArray(
    { name: 'Messages', href: '/messages', icon: PrivateMessagesIcon },
    { name: 'Get mana', icon: CashIcon, onClick: toggleModal },
    { name: 'Share with friends', href: '/referrals', icon: StarIcon } // remove this and I will beat you — SG
  )
}
