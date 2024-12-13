import {
  CloseButton,
  Dialog,
  DialogBackdrop,
  DialogPanel,
  Transition,
  TransitionChild,
} from '@headlessui/react'
import {
  NewspaperIcon,
  QuestionMarkCircleIcon,
  SearchIcon,
  UserCircleIcon,
} from '@heroicons/react/outline'
import { MenuAlt3Icon, XIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { User } from 'common/user'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Fragment, useState } from 'react'
import { UnseenMessagesBubble } from 'web/components/messaging/messages-icon'
import { NotificationsIcon } from 'web/components/notifications-icon'
import { useIsIframe } from 'web/hooks/use-is-iframe'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { trackCallback } from 'web/lib/service/analytics'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import { CoinNumber } from '../widgets/coin-number'
import Sidebar from './sidebar'
import { NavItem } from './sidebar-item'
import { PiSquaresFour } from 'react-icons/pi'

export const BOTTOM_NAV_BAR_HEIGHT = 58

const itemClass =
  'sm:hover:bg-ink-200 block w-full py-1 px-3 text-center sm:hover:text-primary-700 transition-colors'
const selectedItemClass = 'bg-ink-100 text-primary-700'
const touchItemClass = 'bg-primary-100'

function getNavigation(user: User) {
  return [
    {
      name: 'Browse',
      href: '/home',
      icon: SearchIcon,
    },
    {
      name: 'Topics',
      href: '/topics',
      icon: PiSquaresFour,
    },
    {
      name: 'Profile',
      href: `/${user.username}`,
    },
    {
      name: 'Notifs',
      href: `/notifications`,
      icon: NotificationsIcon,
    },
  ]
}

const signedOutNavigation = () => [
  { name: 'Browse', href: '/browse', icon: SearchIcon, alwaysShowName: true },
  {
    name: 'Topics',
    href: '/topics',
    icon: PiSquaresFour,
    alwaysShowName: true,
    // prefetch: false, // should we not prefetch this?
  },
  { name: 'News', href: '/news', icon: NewspaperIcon, alwaysShowName: true },
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
export function BottomNavBar() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const currentPage = usePathname() ?? ''

  const user = useUser()

  const isIframe = useIsIframe()
  if (isIframe) {
    return null
  }

  const navigationOptions = user ? getNavigation(user) : signedOutNavigation()

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

  if (item.name === 'Profile' && user) {
    return (
      <Link
        prefetch={item?.prefetch ?? true}
        href={item.href ?? '#'}
        className={clsx(
          itemClass,
          touched && touchItemClass,
          currentPage === `/${user.username}` && selectedItemClass,
          className
        )}
        onClick={track}
        onTouchStart={() => setTouched(true)}
        onTouchEnd={() => setTouched(false)}
      >
        <Col className="relative mx-auto h-full w-full items-center">
          <Avatar size="sm" avatarUrl={user.avatarUrl} noLink />
          <Row className="gap-1">
            <CoinNumber
              amount={user?.balance}
              className="text-violet-600 dark:text-violet-400"
              numberType="short"
              isInline
              coinClassName="!top-[0.15em]"
            />
            <CoinNumber
              amount={user?.cashBalance}
              className="text-amber-600 dark:text-amber-400"
              coinType="sweepies"
              numberType="short"
              isInline
              coinClassName="!top-[0.15em]"
            />
          </Row>
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

  const currentBasePath = currentPage?.split('/')[1] ?? ''
  const itemPath = item.href.split('/')[1]
  const isCurrentPage = currentBasePath === itemPath
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
}) {
  const { sidebarOpen, setSidebarOpen } = props
  return (
    <div>
      <Transition show={sidebarOpen} as={Fragment}>
        <Dialog
          as="div"
          className="fixed inset-0 z-50 flex justify-end"
          onClose={setSidebarOpen}
        >
          <TransitionChild
            as={Fragment}
            enter="transition-opacity ease-linear duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity ease-linear duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            {/* background cover */}
            <DialogBackdrop className="bg-canvas-100/75 fixed inset-0" />
          </TransitionChild>
          <TransitionChild
            as={Fragment}
            enter="transition ease-in-out duration-300 transform"
            enterFrom="translate-x-full"
            enterTo="translate-x-0"
            leave="transition ease-in-out duration-300 transform"
            leaveFrom="translate-x-0"
            leaveTo="translate-x-full"
          >
            <DialogPanel className="bg-canvas-0 relative w-full max-w-xs">
              <Sidebar className="mx-2 overflow-y-auto" isMobile />
              <CloseButton className="hover:text-primary-600 focus:text-primary-600 text-ink-500 absolute left-0 top-0 z-50 -translate-x-full outline-none">
                <XIcon className="m-2 h-8 w-8" />
              </CloseButton>
            </DialogPanel>
          </TransitionChild>
        </Dialog>
      </Transition>
    </div>
  )
}
