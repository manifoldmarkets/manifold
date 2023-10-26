import { CashIcon, HomeIcon } from '@heroicons/react/outline'
import {
  QuestionMarkCircleIcon,
  HomeIcon as SolidHomeIcon,
  UserCircleIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import { User } from 'common/user'
import { buildArray } from 'common/util/array'
import { useOnline } from 'love/hooks/use-online'
import { ReactNode, useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { AddFundsModal } from 'web/components/add-funds-modal'
import { MobileAppsQRCodeDialog } from 'web/components/buttons/mobile-apps-qr-code-button'
import { Col } from 'web/components/layout/col'
import {
  PrivateMessagesIcon,
  SolidPrivateMessagesIcon,
} from 'web/components/messaging/messages-icon'
import { BottomNavBar } from 'love/components/nav/love-bottom-nav-bar'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useTracking } from 'web/hooks/use-tracking'
import { useUser } from 'web/hooks/use-user'
import { GoogleOneTapLogin } from 'web/lib/firebase/google-onetap-login'
import { firebaseLogin } from 'web/lib/firebase/users'
import Sidebar from './nav/love-sidebar'
import { SolidNotificationsIcon } from 'web/components/notifications-icon'
import { NOTIFICATIONS_TO_SELECT } from 'love/pages/notifications'

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
      : getDesktopNav(!!user)
    : getDesktopNav(!!user)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  trackPageView && useTracking(`view love ${trackPageView}`, trackPageProps)
  useOnline()
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
            hideCreateQuestionButton
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
          hideCreateQuestionButton
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
    { name: 'Profiles', href: '/', icon: SolidHomeIcon },
    {
      name: 'Notifs',
      href: `/notifications`,
      icon: (props) => (
        <SolidNotificationsIcon
          {...props}
          selectTypes={NOTIFICATIONS_TO_SELECT}
        />
      ),
    },
    {
      name: 'Profile',
      href: `/${user.username}`,
    },
    {
      name: 'Messages',
      href: '/messages',
      icon: SolidPrivateMessagesIcon,
    }
  )
}

const signedOutNavigation = () => [
  { name: 'Profiles', href: '/', icon: HomeIcon },
  { name: 'About', href: '/about', icon: QuestionMarkCircleIcon },
  { name: 'Sign in', onClick: firebaseLogin, icon: UserCircleIcon },
]
const getDesktopNav = (loggedIn: boolean) => {
  if (loggedIn)
    return buildArray(
      { name: 'Profiles', href: '/', icon: HomeIcon },
      {
        name: 'Notifs',
        href: `/notifications`,
        icon: (props: any) => (
          <SolidNotificationsIcon
            {...props}
            selectTypes={NOTIFICATIONS_TO_SELECT}
          />
        ),
      },
      {
        name: 'Messages',
        href: '/messages',
        icon: PrivateMessagesIcon,
      }
    )

  return buildArray(
    { name: 'Profiles', href: '/', icon: HomeIcon },
    { name: 'About', href: '/about', icon: QuestionMarkCircleIcon }
  )
}

// No sidebar when signed out
const getSidebarNavigation = (toggleModal: () => void) => {
  return buildArray(
    { name: 'Get mana', icon: CashIcon, onClick: toggleModal }
    // { name: 'Share with friends', href: '/referrals', icon: StarIcon } // remove this and I will beat you — SG
  )
}
