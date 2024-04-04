import { XIcon } from '@heroicons/react/outline'
import clsx from 'clsx'

import { IconButton } from '../buttons/button'
import { Row } from '../layout/row'
import { LogoIcon } from '../icons/logo-icon'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { useEffect } from 'react'
import { safeLocalStorage } from 'web/lib/util/local'

export function Banner(props: {
  setShowBanner?: (show: boolean) => void
  className?: string
  children: React.ReactNode
  link?: string
}) {
  const { setShowBanner, className, children, link } = props
  return (
    <Row
      className={clsx(
        className,
        'text-ink-900 bg-primary-100 group items-center justify-between gap-4'
      )}
    >
      <a
        href={link}
        className="w-full py-3 pl-4"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>

      {setShowBanner && (
        <IconButton onClick={() => setShowBanner(false)}>
          <XIcon className="text-ink-700 h-5 w-5 cursor-pointer" />
        </IconButton>
      )}
    </Row>
  )
}

export function ManifestBanner(props: { hideBanner: () => void }) {
  const { hideBanner } = props
  return (
    <Banner
      className="border-primary-300 from-primary-100 to-primary-200 border bg-gradient-to-b"
      link="https://manifest.is"
      setShowBanner={hideBanner}
    >
      <Row className="gap-2">
        <LogoIcon
          className="h-6 w-6 flex-shrink-0 text-black dark:text-white"
          height={24}
          width={24}
          aria-hidden
          strokeWidth={1}
        />
        <div>
          <span className="font-semibold">Get tickets to Manifest 2024 🥳</span>{' '}
          — our second forecasting festival, June 7-9 in Berkeley, CA
        </div>
      </Row>
    </Banner>
  )
}

const manifestBannerViewCount = 3
export const useManifestBanner = () => {
  const [showBannerCount, setShowBannerCount] = usePersistentLocalState<
    number | undefined
  >(undefined, 'show-manifest-banner-count')
  useEffect(() => {
    const value =
      safeLocalStorage?.getItem('show-manifest-banner-count') ?? 'undefined'
    const count = value === 'undefined' ? manifestBannerViewCount + 1 : +value
    setShowBannerCount(count - 1)
  }, [])
  return [
    !!showBannerCount && showBannerCount > 0,
    () => setShowBannerCount(0),
  ] as const
}
