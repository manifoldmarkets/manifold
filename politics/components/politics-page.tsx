'use client'
import { CashIcon, HomeIcon } from '@heroicons/react/outline'
import {
  HomeIcon as SolidHomeIcon,
  UserCircleIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import { User } from 'common/user'
import { buildArray } from 'common/util/array'
import { ReactNode, useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { AddFundsModal } from 'web/components/add-funds-modal'
import { Col } from 'web/components/layout/col'
import { BottomNavBar } from 'politics/components/nav/politics-bottom-nav-bar'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useTracking } from 'web/hooks/use-tracking'
import { useUser } from 'web/hooks/use-user'
import Sidebar from './nav/politics-sidebar'

import { firebaseLogin } from 'web/lib/firebase/users'
import {
  NotificationsIcon,
  SolidNotificationsIcon,
} from 'web/components/notifications-icon'
import {
  NOTIFICATION_REASONS_TO_SELECT,
  NOTIFICATION_TYPES_TO_SELECT,
} from 'politics/app/notifications/constants'
import { GoogleOneTapLogin } from 'web/lib/firebase/google-onetap-login'

export function PoliticsPage(props: {
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
  const bottomNavOptions = user
    ? getBottomNavigation(user)
    : signedOutNavigation()
  const desktopSidebarOptions = getDesktopNav(user)

  const mobileSidebarOptions = user
    ? getSidebarNavigation(() => setIsAddFundsModalOpen(true))
    : []

  // eslint-disable-next-line react-hooks/rules-of-hooks
  trackPageView && useTracking(`view politics ${trackPageView}`, trackPageProps)
  const [isAddFundsModalOpen, setIsAddFundsModalOpen] = useState(false)

  return (
    <>
      <Col
        className={clsx(
          'pb-[58px] lg:pb-0', // bottom bar padding
          'mx-auto min-h-screen w-full max-w-[1440px] lg:grid lg:grid-cols-12'
        )}
      >
        <GoogleOneTapLogin className="fixed bottom-12 right-4 z-[1000]" />
        <Toaster
          position={isMobile ? 'bottom-center' : 'top-center'}
          containerClassName="!bottom-[70px]"
        />
        {hideSidebar ? (
          <div className="lg:col-span-2 lg:flex" />
        ) : (
          <Sidebar
            navigationOptions={desktopSidebarOptions}
            className="sticky top-0 hidden self-start px-2 lg:col-span-2 lg:flex"
          />
        )}
        <main
          className={clsx(
            'flex flex-1 flex-col lg:mt-6 xl:px-2',
            'col-span-10',
            className
          )}
        >
          {children}
        </main>
      </Col>
      {!hideBottomBar && (
        <BottomNavBar
          sidebarNavigationOptions={mobileSidebarOptions}
          navigationOptions={bottomNavOptions}
        />
      )}
      <AddFundsModal
        open={isAddFundsModalOpen}
        setOpen={setIsAddFundsModalOpen}
      />
    </>
  )
}

function getBottomNavigation(user: User) {
  return buildArray(
    { name: 'Home', href: '/', icon: SolidHomeIcon },
    {
      name: 'Notifs',
      href: `/notifications`,
      icon: (props) => (
        <SolidNotificationsIcon
          {...props}
          selectTypes={NOTIFICATION_TYPES_TO_SELECT}
          selectReasons={NOTIFICATION_REASONS_TO_SELECT}
        />
      ),
    },
    {
      name: 'Profile',
      href: `/${user.username}`,
    }
  )
}

const signedOutNavigation = () => [
  { name: 'Home', href: '/', icon: SolidHomeIcon },
  {
    name: 'Sign in',
    onClick: firebaseLogin,
    icon: UserCircleIcon,
  },
]
const getDesktopNav = (user: User | null | undefined) => {
  if (user)
    return buildArray(
      { name: 'Home', href: '/', icon: HomeIcon },
      {
        name: 'Notifs',
        href: `/notifications`,
        icon: (props: any) => (
          <NotificationsIcon
            {...props}
            selectTypes={NOTIFICATION_TYPES_TO_SELECT}
            selectReasons={NOTIFICATION_REASONS_TO_SELECT}
          />
        ),
      }
    )

  return buildArray({ name: 'Home', href: '/', icon: HomeIcon })
}

// No sidebar when signed out
const getSidebarNavigation = (toggleModal: () => void) => {
  return buildArray({ name: 'Get mana', icon: CashIcon, onClick: toggleModal })
}
