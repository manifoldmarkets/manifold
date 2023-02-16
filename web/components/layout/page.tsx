import clsx from 'clsx'
import { ReactNode } from 'react'
import { BottomNavBar } from '../nav/bottom-nav-bar'
import Sidebar from '../nav/sidebar'
import { Toaster } from 'react-hot-toast'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { Col } from './col'

export function Page(props: {
  rightSidebar?: ReactNode
  className?: string
  children?: ReactNode
  logoSubheading?: string
  touchesTop?: boolean
  hideSidebar?: boolean
}) {
  const {
    children,
    rightSidebar,
    className,
    logoSubheading,
    touchesTop,
    hideSidebar,
  } = props

  const isMobile = useIsMobile()
  const bottomBarPadding = 'pb-[58px] lg:pb-0 '
  const TOAST_BOTTOM_PADDING = isMobile ? 70 : 20
  return (
    <>
      <Col
        className={clsx(
          className,
          bottomBarPadding,
          'mx-auto min-h-screen w-full lg:grid lg:grid-cols-12 lg:gap-x-2 xl:max-w-7xl xl:gap-x-8'
        )}
      >
        <Toaster
          position={isMobile ? 'bottom-center' : 'top-center'}
          containerStyle={{
            bottom: TOAST_BOTTOM_PADDING,
          }}
        />
        {hideSidebar ? (
          <div className="sticky top-0 hidden self-start pl-2 lg:col-span-2 lg:flex" />
        ) : (
          <Sidebar
            logoSubheading={logoSubheading}
            className="sticky top-0 hidden self-start pl-2 lg:col-span-2 lg:flex"
          />
        )}
        {/* put right sidebar below main content on small or medium screens */}
        <Col className="flex-1 lg:col-span-8 xl:contents">
          <main
            className={clsx(
              'flex flex-1 flex-col',
              touchesTop ? '' : 'lg:mt-6',
              rightSidebar ? 'col-span-7' : 'col-span-8'
            )}
          >
            {children}
          </main>
          {rightSidebar && (
            <aside className="col-span-3">
              <div className="scrollbar-hide xl:sticky xl:top-0 xl:bottom-0 xl:h-screen xl:overflow-y-auto xl:py-6">
                {rightSidebar}
              </div>
            </aside>
          )}
        </Col>
      </Col>
      <BottomNavBar />
    </>
  )
}
