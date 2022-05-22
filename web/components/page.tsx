import clsx from 'clsx'
import { BottomNavBar } from './nav/nav-bar'
import Sidebar from './nav/sidebar'
import { Toaster } from 'react-hot-toast'

export function Page(props: {
  margin?: boolean
  assertUser?: 'signed-in' | 'signed-out'
  rightSidebar?: React.ReactNode
  suspend?: boolean
  children?: any
}) {
  const { margin, assertUser, children, rightSidebar, suspend } = props

  return (
    <>
      <div
        className={clsx(
          'mx-auto w-full pb-14 lg:grid lg:grid-cols-12 lg:gap-8 lg:pt-6 xl:max-w-7xl',
          margin && 'px-4'
        )}
        style={suspend ? visuallyHiddenStyle : undefined}
      >
        <Toaster />
        <Sidebar className="sticky top-4 hidden divide-gray-300 self-start pl-2 lg:col-span-2 lg:block" />
        <main
          className={clsx(
            'lg:col-span-8',
            rightSidebar ? 'xl:col-span-7' : 'xl:col-span-8'
          )}
        >
          {children}

          {/* If right sidebar is hidden, place its content at the bottom of the page. */}
          <div className="mt-4 block xl:hidden">{rightSidebar}</div>
        </main>
        <aside className="hidden xl:col-span-3 xl:block">
          <div className="sticky top-4 space-y-4">{rightSidebar}</div>
        </aside>
      </div>

      <BottomNavBar />
    </>
  )
}

const visuallyHiddenStyle = {
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  height: 1,
  margin: -1,
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  width: 1,
  whiteSpace: 'nowrap',
} as const
