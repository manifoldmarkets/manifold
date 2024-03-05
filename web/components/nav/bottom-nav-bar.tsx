import Link from 'next/link'
import clsx from 'clsx'
import { MenuAlt3Icon } from '@heroicons/react/solid'
import {
  HomeIcon,
  NewspaperIcon,
  QuestionMarkCircleIcon,
  SearchIcon,
  UserCircleIcon,
} from '@heroicons/react/outline'
import { BiSearchAlt2 } from 'react-icons/bi'
import { animated } from '@react-spring/web'
import { Transition, Dialog } from '@headlessui/react'
import { useState, Fragment } from 'react'

import Sidebar from './sidebar'
import { NavItem } from './sidebar-item'
import { useUser } from 'web/hooks/use-user'
import { formatMoney } from 'common/util/format'
import { NotificationsIcon } from 'web/components/notifications-icon'
import { useIsIframe } from 'web/hooks/use-is-iframe'
import { trackCallback } from 'web/lib/service/analytics'
import { User } from 'common/user'
import { Col } from '../layout/col'
import { firebaseLogin } from 'web/lib/firebase/users'
import { useAnimatedNumber } from 'web/hooks/use-animated-number'
import { UnseenMessagesBubble } from 'web/components/messaging/messages-icon'
import { usePathname } from 'next/navigation'
import { Avatar } from '../widgets/avatar'
import { GiCapitol } from 'react-icons/gi'

export const BOTTOM_NAV_BAR_HEIGHT = 58

const itemClass =
  'sm:hover:bg-ink-200 block w-full py-1 px-3 text-center sm:hover:text-primary-700 transition-colors'
const selectedItemClass = 'bg-ink-100 text-primary-700'
const touchItemClass = 'bg-primary-100'

function getNavigation(user: User) {
  return [
    {
      name: 'Home',
      href: '/home',
      icon: HomeIcon,
    },
    {
      name: 'Browse',
      href: '/browse/for-you',
      icon: BiSearchAlt2,
    },
    {
      name: 'Politics',
      href: '/politics',
      icon: GiCapitol,
      prefetch: false,
    },
    {
      name: 'Notifs',
      href: `/notifications`,
      icon: NotificationsIcon,
    },
    {
      name: 'Portfolio',
      href: `/${user.username}/portfolio`,
    },
  ]
}

const signedOutNavigation = () => [
  {
    name: 'Politics',
    href: '/politics',
    icon: GiCapitol,
    alwaysShowName: true,
    // prefetch: false, // should we not prefetch this?
  },
  { name: 'News', href: '/news', icon: NewspaperIcon, alwaysShowName: true },
  { name: 'Browse', href: '/browse', icon: SearchIcon, alwaysShowName: true },
  {
    name: 'About',
    href: '/about',
    icon: QuestionMarkCircleIcon,
    alwaysShowName: true,
  },
  {
    name: 'Sign in',
    onClick: firebaseLogin,
    icon: UserCircleIcon,
    alwaysShowName: true,
  },
]

// From https://codepen.io/chris__sev/pen/QWGvYbL
export function BottomNavBar(props: {
  navigationOptions?: NavItem[]
  sidebarNavigationOptions?: NavItem[]
  hideCreateQuestionButton?: boolean
}) {
  const { hideCreateQuestionButton } = props
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const currentPage = usePathname() ?? ''

  const user = useUser()

  const isIframe = useIsIframe()
  if (isIframe) {
    return null
  }

  const navigationOptions =
    props.navigationOptions ??
    (user ? getNavigation(user) : signedOutNavigation())

  return (
    <nav className="border-ink-200 dark:border-ink-300 text-ink-700 bg-canvas-0 fixed inset-x-0 bottom-0 z-50 flex select-none items-center justify-between border-t-2 text-xs lg:hidden">
      {navigationOptions.map((item) => (
        <NavBarItem
          key={item.name}
          item={item}
          currentPage={currentPage}
          user={user}
          className={item.name === 'Politics' ? '-mt-1' : ''}
        />
      ))}
      {!!user && (
        <>
          <div
            className={clsx(
              itemClass,
              'relative',
              sidebarOpen ? selectedItemClass : ''
            )}
            onClick={() => setSidebarOpen(true)}
          >
            <UnseenMessagesBubble />
            <MenuAlt3Icon className="mx-auto my-2 h-8 w-8" aria-hidden="true" />
          </div>
          <MobileSidebar
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
            sidebarNavigationOptions={props.sidebarNavigationOptions}
            hideCreateQuestionButton={hideCreateQuestionButton}
          />
        </>
      )}
    </nav>
  )
}

function NavBarItem(props: {
  item: NavItem
  currentPage: string
  children?: any
  user?: User | null
  className?: string
}) {
  const { item, currentPage, children, user, className } = props
  const track = trackCallback(`navbar: ${item.trackingEventName ?? item.name}`)
  const [touched, setTouched] = useState(false)
  const balance = useAnimatedNumber(user?.balance ?? 0)
  if (item.name === 'Portfolio' && user) {
    return (
      <Link
        prefetch={item?.prefetch ?? true}
        href={item.href ?? '#'}
        className={clsx(
          itemClass,
          touched && touchItemClass,
          currentPage === `/${user.username}/portfolio` && selectedItemClass,
          className
        )}
        onClick={track}
        onTouchStart={() => setTouched(true)}
        onTouchEnd={() => setTouched(false)}
      >
        <Col>
          <div className="mx-auto my-1">
            <Avatar size="xs" avatarUrl={user.avatarUrl} noLink />
          </div>
          <animated.div>{balance.to((b) => formatMoney(b))}</animated.div>
        </Col>
      </Link>
    )
  }

  if (!item.href) {
    return (
      <button
        className={clsx(itemClass, touched && touchItemClass, className)}
        onClick={() => {
          track()
          item.onClick?.()
        }}
        onTouchStart={() => setTouched(true)}
        onTouchEnd={() => setTouched(false)}
      >
        {item.icon && <item.icon className="mx-auto my-2 h-8 w-8" />}
        {children}
        {item.alwaysShowName && item.name}
      </button>
    )
  }

  const currentBasePath = '/' + (currentPage?.split('/')[1] ?? '')
  const isCurrentPage = currentBasePath === item.href.split('?')[0]

  return (
    <Link
      href={item.href}
      className={clsx(
        itemClass,
        touched && touchItemClass,
        isCurrentPage && selectedItemClass,
        className
      )}
      onClick={track}
      onTouchStart={() => setTouched(true)}
      onTouchEnd={() => setTouched(false)}
    >
      {item.icon && <item.icon className="mx-auto my-2 h-8 w-8" />}
      {children}
      {item.alwaysShowName && item.name}
    </Link>
  )
}

// Sidebar that slides out on mobile
export function MobileSidebar(props: {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  sidebarNavigationOptions?: NavItem[]
  hideCreateQuestionButton?: boolean
}) {
  const { sidebarOpen, setSidebarOpen, hideCreateQuestionButton } = props
  return (
    <div>
      <Transition.Root show={sidebarOpen} as={Fragment}>
        <Dialog
          as="div"
          className="fixed inset-0 z-50 flex"
          onClose={setSidebarOpen}
        >
          <Transition.Child
            as={Fragment}
            enter="transition-opacity ease-linear duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity ease-linear duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            {/* background cover */}
            <Dialog.Overlay className="bg-canvas-100/75 fixed inset-0" />
          </Transition.Child>
          <div className="w-14 flex-shrink-0" aria-hidden="true">
            {/* Dummy element to force sidebar content to the right */}
          </div>
          <Transition.Child
            as={Fragment}
            enter="transition ease-in-out duration-300 transform"
            enterFrom="translate-x-full"
            enterTo="translate-x-0"
            leave="transition ease-in-out duration-300 transform"
            leaveFrom="translate-x-0"
            leaveTo="translate-x-full"
          >
            <div className="bg-canvas-0 relative ml-auto flex w-full max-w-xs flex-1 flex-col">
              <div className="mx-2 h-0 flex-1 overflow-y-auto">
                <Sidebar
                  navigationOptions={props.sidebarNavigationOptions}
                  isMobile
                  hideCreateQuestionButton={hideCreateQuestionButton}
                />
              </div>
            </div>
          </Transition.Child>
        </Dialog>
      </Transition.Root>
    </div>
  )
}
