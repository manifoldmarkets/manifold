import { XIcon } from '@heroicons/react/outline'
import clsx from 'clsx'

import { IconButton } from '../buttons/button'
import { Row } from '../layout/row'
import { LogoIcon } from '../icons/logo-icon'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import Link from 'next/link'

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
        'text-ink-900 bg-primary-100 z-10 justify-between gap-4'
      )}
    >
      {link ? (
        <Link
          target="_blank"
          href={link}
          className="pl-4"
          rel="noopener noreferrer"
        >
          {children}
        </Link>
      ) : (
        <div className={'pl-4'}>{children}</div>
      )}

      {setShowBanner && (
        <IconButton
          className={'h-8'}
          size={'sm'}
          onClick={() => {
            setShowBanner(false)
          }}
        >
          <XIcon className="text-ink-700 h-5 w-5" />
        </IconButton>
      )}
    </Row>
  )
}

export function PivotBanner(props: { hideBanner: () => void }) {
  const { hideBanner } = props
  return (
    <Banner
      className="border-primary-300 from-primary-100 to-primary-200 border bg-gradient-to-b"
      link="https://news.manifold.markets/p/exploring-cash-prizes-for-good-predictions"
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
          <span className="font-semibold">Coming soon!</span> Cash prizes and
          other changes. Read more
        </div>
      </Row>
    </Banner>
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

export function DowntimeBanner() {
  const maintainanceBannerEnabled = false
  if (!maintainanceBannerEnabled) return null
  return (
    <Banner className=" bg-primary-100 hover:bg-primary-200 dark:text-primary-800 text-primary-700  hover:text-primary-900 items-center py-2  transition-colors">
      ⚠️ Manifold will be down at 9PM PT for about 1 hour, as we upgrade our
      financial infrastructure.
    </Banner>
  )
}

export function WatchPartyBanner() {
  return (
    <Banner
      className="border-primary-300 from-primary-100 to-primary-200 my-2 border bg-gradient-to-b py-2"
      link="/tv"
    >
      🇺🇸 Join the presidential debate watch party on Manifold TV! 🇺🇸
    </Banner>
  )
}

export const useBanner = (name: string) => {
  const [bannerSeen, setBannerSeen] = usePersistentLocalState<number>(
    0,
    `${name}-banner-seen`
  )

  return [!bannerSeen, () => setBannerSeen(1)] as const
}

export const FeeBanner = () => {
  const [showBanner, hideBanner] = useBanner('fee-change')
  if (!showBanner) return null
  return (
    <Banner
      className="bg-primary-100 hover:bg-primary-200 dark:text-primary-800 text-primary-700 hover:text-primary-900 items-center py-2 transition-colors"
      link="https://manifoldmarkets.notion.site/Fee-change-18b54492ea7a80a6b069d488fc3613ee"
      setShowBanner={hideBanner}
    >
      <Row className="items-center gap-2">
        <LogoIcon
          className="h-6 w-6 flex-shrink-0 text-black dark:text-white"
          height={24}
          width={24}
          aria-hidden
          strokeWidth={1}
        />
        <div>Sweepstakes fees changing on Feb 3rd. Read more</div>
      </Row>
    </Banner>
  )
}

export const TwombaBanner = () => {
  const [showBanner, hideBanner] = useBanner('twomba')
  if (!showBanner) return null
  return (
    <Banner
      className="bg-primary-100 hover:bg-primary-200  dark:text-primary-800 text-primary-700 hover:text-primary-900 items-center py-2 transition-colors"
      link="https://news.manifold.markets/p/cash-prizes-are-here"
      setShowBanner={hideBanner}
    >
      <Row className=" items-center gap-2">
        <LogoIcon
          className="h-6 w-6 flex-shrink-0 text-black dark:text-white"
          height={24}
          width={24}
          aria-hidden
          strokeWidth={1}
        />
        <div>Sweepstakes cash prizes are here! Read more</div>
      </Row>
    </Banner>
  )
}
