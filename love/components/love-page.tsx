import clsx from 'clsx'
import { ReactNode } from 'react'
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
  HomeIcon,
  QuestionMarkCircleIcon,
  SearchIcon,
  UserCircleIcon,
} from '@heroicons/react/solid'
import { SolidNotificationsIcon } from 'web/components/notifications-icon'
import { firebaseLogin } from 'web/lib/firebase/users'

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
  const navigationOptions = user ? getNavigation(user) : signedOutNavigation()
  // eslint-disable-next-line react-hooks/rules-of-hooks
  trackPageView && useTracking(`view ${trackPageView}`, trackPageProps)
  const isMobile = useIsMobile()

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
          <Sidebar className="sticky top-0 hidden self-start px-2 lg:col-span-2 lg:flex" />
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
      {!hideBottomBar && <BottomNavBar navigationOptions={navigationOptions} />}
    </>
  )
}

function getNavigation(user: User) {
  return [
    { name: 'Home', href: '/home', icon: HomeIcon },
    { name: 'Browse', href: '/profiles', icon: SearchIcon },
    {
      name: 'Profile',
      href: `/${user.username}`,
    },
    {
      name: 'Notifs',
      href: `/notifications`,
      icon: SolidNotificationsIcon,
    },
  ]
}

const signedOutNavigation = () => [
  { name: 'Browse', href: '/browse', icon: SearchIcon },
  { name: 'About', href: '/about', icon: QuestionMarkCircleIcon },
  { name: 'Sign in', onClick: firebaseLogin, icon: UserCircleIcon },
]
