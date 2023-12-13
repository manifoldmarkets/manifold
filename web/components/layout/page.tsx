import clsx from 'clsx'
import { ReactNode, useEffect } from 'react'
import { BottomNavBar } from '../nav/bottom-nav-bar'
import Sidebar from '../nav/sidebar'
import { Toaster } from 'react-hot-toast'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { Col } from './col'
import { GoogleOneTapLogin } from 'web/lib/firebase/google-onetap-login'
import { ConfettiOnDemand } from '../confetti-on-demand'
import { useTracking } from 'web/hooks/use-tracking'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { safeLocalStorage } from 'web/lib/util/local'
import { Banner } from '../nav/banner'
import { ENV_CONFIG } from 'common/envs/constants'
import { useUser } from 'web/hooks/use-user'

export function Page(props: {
  trackPageView: string | false
  trackPageProps?: Record<string, any>
  className?: string
  children?: ReactNode
  hideSidebar?: boolean
  hideBottomBar?: boolean
  manifoldWrappedBannerEnabled?: boolean
}) {
  const {
    trackPageView,
    trackPageProps,
    children,
    className,
    hideSidebar,
    hideBottomBar,
    manifoldWrappedBannerEnabled,
  } = props

  // eslint-disable-next-line react-hooks/rules-of-hooks
  trackPageView && useTracking(`view ${trackPageView}`, trackPageProps)
  const isMobile = useIsMobile()

  const [showBanner, setShowBanner] = usePersistentLocalState<
    boolean | undefined
  >(undefined, 'show-manifest-banner')
  useEffect(() => {
    const shouldHide =
      safeLocalStorage?.getItem('show-manifest-banner') === 'false'
    if (!shouldHide) {
      setShowBanner(true)
    }
  }, [showBanner])
  const user = useUser()

  return (
    <>
      <ConfettiOnDemand />
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
            manifoldWrappedBannerEnabled && showBanner ? 'lg:mt-0' : 'lg:mt-6',
            className
          )}
        >
          {manifoldWrappedBannerEnabled && showBanner && user && (
            <Banner
              className="mb-3"
              setShowBanner={setShowBanner}
              link={`https://${ENV_CONFIG.domain}/${user.username}/wrapped2023`}
            >
              <div className="flex flex-col items-start">
                🎁 Your Manifold Wrapped is here!
              </div>
            </Banner>
          )}
          {children}
        </main>
      </Col>
      {!hideBottomBar && <BottomNavBar />}
    </>
  )
}
