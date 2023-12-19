'use client'
import Link from 'next/link'
import clsx from 'clsx'
import { MenuAlt3Icon } from '@heroicons/react/solid'
import { animated } from '@react-spring/web'
import { Transition, Dialog } from '@headlessui/react'
import { useState, Fragment } from 'react'

import Sidebar from './politics-sidebar'
import { Item } from './politics-sidebar-item'
import { useUser } from 'web/hooks/use-user'
import { formatMoney } from 'common/util/format'
import { Avatar } from 'web/components/widgets/avatar'
import { useIsIframe } from 'web/hooks/use-is-iframe'
import { trackCallback } from 'web/lib/service/analytics'
import { User } from 'common/user'
import { Col } from 'web/components/layout/col'
import { useAnimatedNumber } from 'web/hooks/use-animated-number'
import { usePathname } from 'next/navigation'

const itemClass =
  'sm:hover:bg-ink-200 block w-full py-1 px-3 text-center sm:hover:text-ink-700 transition-colors'
const selectedItemClass = 'bg-ink-100 text-ink-700'
const touchItemClass = 'bg-ink-100'

// From https://codepen.io/chris__sev/pen/QWGvYbL
export function BottomNavBar(props: {
  navigationOptions: Item[]
  sidebarNavigationOptions: Item[]
}) {
  const { navigationOptions, sidebarNavigationOptions } = props
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const currentPage = usePathname() ?? ''

  const user = useUser()

  const isIframe = useIsIframe()
  if (isIframe) {
    return null
  }

  return (
    <nav className="border-ink-200 dark:border-ink-300 text-ink-700 bg-canvas-0 fixed inset-x-0 bottom-0 z-50 flex select-none items-center justify-between border-t-2 text-xs lg:hidden">
      {navigationOptions.map((item) => (
        <NavBarItem
          key={item.name}
          item={item}
          currentPage={currentPage}
          user={user}
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
            <MenuAlt3Icon className="mx-auto my-1 h-6 w-6" aria-hidden="true" />
            More
          </div>
          <MobileSidebar
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
            sidebarNavigationOptions={sidebarNavigationOptions}
          />
        </>
      )}
    </nav>
  )
}

function ProfileItem(props: {
  user: User
  item: Item
  touched: boolean
  setTouched: (touched: boolean) => void
  currentPage: string
  track: () => void
}) {
  const { user, item, touched, setTouched, currentPage, track } = props
  const balance = useAnimatedNumber(user?.balance ?? 0)
  return (
    <Link
      href={item.href ?? '#'}
      className={clsx(
        itemClass,
        touched && touchItemClass,
        currentPage === '/[username]' && selectedItemClass
      )}
      onClick={track}
      onTouchStart={() => setTouched(true)}
      onTouchEnd={() => setTouched(false)}
    >
      <Col>
        <div className="mx-auto my-1">
          <Avatar
            size="xs"
            username={user.username}
            avatarUrl={user.avatarUrl}
            noLink
          />
        </div>
        <animated.div>{balance.to((b) => formatMoney(b))}</animated.div>
      </Col>
    </Link>
  )
}

function NavBarItem(props: {
  item: Item
  currentPage: string
  children?: any
  user?: User | null
  className?: string
}) {
  const { item, currentPage, children, user } = props
  const track = trackCallback(`navbar: ${item.trackingEventName ?? item.name}`)
  const [touched, setTouched] = useState(false)
  if (item.name === 'Profile' && user) {
    return (
      <ProfileItem
        user={user}
        item={item}
        touched={touched}
        setTouched={setTouched}
        currentPage={currentPage}
        track={track}
      />
    )
  }

  if (!item.href) {
    return (
      <button
        className={clsx(itemClass, touched && touchItemClass)}
        onClick={() => {
          track()
          item.onClick?.()
        }}
        onTouchStart={() => setTouched(true)}
        onTouchEnd={() => setTouched(false)}
      >
        {item.icon && <item.icon className="mx-auto my-1 h-6 w-6" />}
        {children}
        {item.name}
      </button>
    )
  }

  const currentBasePath = '/' + (currentPage?.split('/')[1] ?? '')
  const isCurrentPage =
    item.href != null && currentBasePath === item.href.split('?')[0]

  return (
    <Link
      href={item.href}
      className={clsx(
        itemClass,
        touched && touchItemClass,
        isCurrentPage && selectedItemClass
      )}
      onClick={track}
      onTouchStart={() => setTouched(true)}
      onTouchEnd={() => setTouched(false)}
    >
      {item.icon && <item.icon className="mx-auto my-1 h-6 w-6" />}
      {children}
      {item.name}
    </Link>
  )
}

// Sidebar that slides out on mobile
export function MobileSidebar(props: {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  sidebarNavigationOptions: Item[]
}) {
  const { sidebarOpen, sidebarNavigationOptions, setSidebarOpen } = props
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
          <Transition.Child
            as={Fragment}
            enter="transition ease-in-out duration-300 transform"
            enterFrom="-translate-x-full"
            enterTo="translate-x-0"
            leave="transition ease-in-out duration-300 transform"
            leaveFrom="translate-x-0"
            leaveTo="-translate-x-full"
          >
            <div className="bg-canvas-0 relative flex w-full max-w-xs flex-1 flex-col">
              <div className="mx-2 h-0 flex-1 overflow-y-auto">
                <Sidebar
                  navigationOptions={sidebarNavigationOptions}
                  isMobile
                />
              </div>
            </div>
          </Transition.Child>
          <div className="w-14 flex-shrink-0" aria-hidden="true">
            {/* Dummy element to force sidebar to shrink to fit close icon */}
          </div>
        </Dialog>
      </Transition.Root>
    </div>
  )
}
