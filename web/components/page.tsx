import clsx from 'clsx'
import { ReactNode } from 'react'
import { BottomNavBar } from './nav/bottom-nav-bar'
import Sidebar from './nav/sidebar'
import { Toaster } from 'react-hot-toast'
import { ScrollToTopButton } from './scroll-to-top-button'

export function Page(props: {
  rightSidebar?: ReactNode
  className?: string
  rightSidebarClassName?: string
  children?: ReactNode
  logoSubheading?: string
}) {
  const {
    children,
    rightSidebar,
    className,
    rightSidebarClassName,
    logoSubheading,
  } = props

  const bottomBarPadding = 'pb-[58px] lg:pb-0 '
  return (
    <>
      <div
        className={clsx(
          className,
          bottomBarPadding,
          'mx-auto w-full lg:grid lg:grid-cols-12 lg:gap-x-2 xl:max-w-7xl xl:gap-x-8'
        )}
      >
        <Toaster />
        <Sidebar
          logoSubheading={logoSubheading}
          className="sticky top-0 hidden divide-gray-300 self-start pl-2 lg:col-span-2 lg:flex"
        />
        <main
          className={clsx(
            'lg:col-span-8 lg:pt-6',
            rightSidebar ? 'xl:col-span-7' : 'xl:col-span-8'
          )}
        >
          {children}

          {/* If right sidebar is hidden, place its content at the bottom of the page. */}
          <div className="block xl:hidden">{rightSidebar}</div>
        </main>
        <aside className="hidden xl:col-span-3 xl:block">
          <div
            className={clsx('sticky top-4 space-y-4', rightSidebarClassName)}
          >
            {rightSidebar}
          </div>
        </aside>
      </div>
      <ScrollToTopButton className="inset-left-[90%] inset-right-0 fixed bottom-8" />
      <BottomNavBar />
    </>
  )
}
