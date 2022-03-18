import clsx from 'clsx'
import { NavBar } from './nav/nav-bar'
import Sidebar from './nav/sidebar'

export function Page(props: {
  wide?: boolean
  margin?: boolean
  assertUser?: 'signed-in' | 'signed-out'
  children?: any
}) {
  const { wide, margin, assertUser, children } = props

  return (
    <div>
      <NavBar wide={wide} assertUser={assertUser} />

      <div
        className={clsx(
          'mx-auto w-full pb-16 lg:grid lg:max-w-7xl lg:grid-cols-12 lg:gap-8',
          wide ? 'max-w-6xl' : 'max-w-4xl',
          margin && 'px-4'
        )}
      >
        <div className="hidden lg:col-span-3 lg:block xl:col-span-2">
          <Sidebar />
        </div>
        <main className="lg:col-span-9 xl:col-span-8">{children}</main>
        <aside className="hidden xl:col-span-3 xl:block">
          <div className="sticky top-4 space-y-4"></div>
        </aside>
      </div>
    </div>
  )
}
