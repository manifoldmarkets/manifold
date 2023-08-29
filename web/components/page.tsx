import clsx from 'clsx'
import { ReactNode } from 'react'
import { BottomNavBar } from './nav/nav-bar'
import Sidebar from './nav/sidebar'
import { Toaster } from 'react-hot-toast'
import { Button } from './button'
import { Col } from './layout/col'
import { SiteLink } from './site-link'
import { Row } from './layout/row'

export function Page(props: {
  rightSidebar?: ReactNode
  suspend?: boolean
  className?: string
  rightSidebarClassName?: string
  children?: ReactNode
}) {
  const { children, rightSidebar, suspend, className, rightSidebarClassName } =
    props

  const bottomBarPadding = 'pb-[58px] lg:pb-0 '
  return (
    <>
      <div
        className={clsx(
          className,
          bottomBarPadding,
          'mx-auto w-full lg:grid lg:grid-cols-12 lg:gap-x-2 xl:max-w-7xl xl:gap-x-8'
        )}
        style={suspend ? visuallyHiddenStyle : undefined}
      >
        <Toaster />
        <Sidebar className="sticky top-0 hidden divide-gray-300 self-start pl-2 lg:col-span-2 lg:block" />
        <main
          className={clsx(
            'lg:col-span-8 lg:pt-6',
            rightSidebar ? 'xl:col-span-7' : 'xl:col-span-8'
          )}
        >
          <Col className="mb-4 items-start gap-4 rounded border border-indigo-200 bg-indigo-100 px-6 py-4 shadow">
            <div className="text-2xl">Tournament complete!</div>
            <div>
              Thanks for participating. Read about the results, or continue
              betting on Manifold.
            </div>
            <Row className="gap-4">
              <SiteLink href="https://www.cspicenter.com/p/results-for-the-salemcspi-prediction">
                <Button color="gradient">Results & writeup</Button>
              </SiteLink>
              <SiteLink href="https://manifold.markets">
                <Button color="gradient">Go to Manifold</Button>
              </SiteLink>
            </Row>
          </Col>
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
  userSelect: 'none',
  visibility: 'hidden',
} as const
