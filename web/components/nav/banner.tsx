import { XIcon } from '@heroicons/react/outline'
import clsx from 'clsx'

import { IconButton } from '../buttons/button'
import { Row } from '../layout/row'
import { LogoIcon } from '../icons/logo-icon'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import Link from 'next/link'
import { ArrowRightIcon } from '@heroicons/react/solid'
import { useUser } from 'web/hooks/use-user'
import { useActiveHolidaySale } from 'web/hooks/use-holiday-sale'
import {
  formatDiscountPercent,
  HolidaySale,
  HolidaySaleKind,
} from 'common/holiday-sale'

export function Banner(props: {
  setShowBanner?: (show: boolean) => void
  className?: string
  children: React.ReactNode
  link?: string
  target?: '_blank' | '_self'
  // For banners on a dark background, where the default icon colour is lost.
  dismissIconClassName?: string
}) {
  const {
    setShowBanner,
    className,
    children,
    link,
    target = '_blank',
    dismissIconClassName = 'text-ink-700',
  } = props
  return (
    <Row
      className={clsx(
        className,
        'text-ink-900 bg-primary-100 z-10 justify-between gap-4'
      )}
    >
      {link ? (
        <Link
          target={target}
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
          aria-label="Dismiss banner"
          className={'h-8'}
          size={'sm'}
          onClick={() => {
            setShowBanner(false)
          }}
        >
          <XIcon className={clsx(dismissIconClassName, 'h-5 w-5')} />
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

export function Manifest2026Banner() {
  const [showBanner, hideBanner] = useBanner('manifest-2026')
  if (!showBanner) return null
  return (
    <Banner
      className="border-primary-300 from-primary-100 to-primary-200 my-2 border bg-gradient-to-b py-2"
      link="https://manifest.is"
      setShowBanner={hideBanner}
    >
      <Row className="items-center gap-2 py-1">
        <LogoIcon
          className="h-6 w-6 flex-shrink-0 text-black dark:text-white"
          height={24}
          width={24}
          aria-hidden
          strokeWidth={1}
        />
        <div>
          <span className="font-semibold">Manifest 2026</span> is June 12-14th
          in Berkeley! Get tickets now!
        </div>
        <ArrowRightIcon className="ml-1 h-4 w-4" />
      </Row>
    </Banner>
  )
}

export function DowntimeBanner() {
  const maintainanceBannerEnabled = false
  if (!maintainanceBannerEnabled) return null
  return (
    <Banner className=" bg-primary-100 hover:bg-primary-200 dark:text-primary-800 text-primary-700  hover:text-primary-900 items-center py-2  transition-colors">
      ⚠️ Manifold will be down at 9PM PT for about 2 hours, as we upgrade our
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

export function StateOfTheUnionBanner() {
  return (
    <Banner
      className="border-primary-300 from-primary-100 to-primary-200 my-2 border bg-gradient-to-b py-2"
      link="https://manifold.markets/tv/86"
      target="_self"
    >
      🇺🇸 Join our State of the Union watch party{' '}
      {new Date('2024-03-05T21:00:00-05:00').toLocaleString(undefined, {
        weekday: 'long',
        hour: 'numeric',
      })}
      ! 🇺🇸
    </Banner>
  )
}

export function StateOfTheUnion2026Banner() {
  const [showBanner, hideBanner] = useBanner('sotu-2026')
  if (!showBanner) return null
  return (
    <Banner
      className="my-2 items-center border border-blue-300 bg-gradient-to-r from-red-50 via-white to-blue-50 py-3 transition-colors hover:from-red-100 hover:via-white hover:to-blue-100 dark:from-red-950/30 dark:via-slate-900/30 dark:to-blue-950/30"
      link="https://manifold.markets/tv/109"
      target="_self"
      setShowBanner={hideBanner}
    >
      <Row className="items-center gap-2">
        <span className="text-lg">🇺🇸</span>
        <div>
          <span className="font-semibold">State of the Union watch party</span>{' '}
          on Manifold TV tonight at{' '}
          {new Date('2026-02-24T21:00:00-05:00').toLocaleString(undefined, {
            hour: 'numeric',
          })}
        </div>
        <ArrowRightIcon className="ml-1 h-4 w-4" />
      </Row>
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

export const ManaForeverBanner = () => {
  const [showBanner, hideBanner] = useBanner('mana-forever')
  const user = useUser()
  if (!showBanner || !user) return null
  if (user.createdTime > new Date('2025-02-12').getTime()) return null
  if (user.cashBalance < 25) return null
  return (
    <Banner
      className="bg-primary-100 hover:bg-primary-200  dark:text-primary-800 text-primary-700 hover:text-primary-900 items-center py-2 transition-colors"
      link="https://manifoldmarkets.notion.site/Mana-forever-19154492ea7a80c08410ea8c64fac67e?pvs=74"
      setShowBanner={hideBanner}
    >
      <div>
        We are shutting down sweepstakes to focus on the manaverse! See more{' '}
        <ArrowRightIcon className="ml-1 inline-block h-4 w-4" />
      </div>
    </Banner>
  )
}

// Last year's Black Friday and Cyber Monday banner looks, picked by date from
// common/holiday-sale.ts, so nobody has to deploy at midnight to swap them.
const HOLIDAY_SALE_BANNER_STYLES: Record<
  HolidaySaleKind,
  { background: string; accent: string; chip: string; emoji: string }
> = {
  'black-friday': {
    background: 'bg-gradient-to-r from-gray-900 to-black',
    accent: 'text-amber-400',
    chip: 'bg-amber-400',
    emoji: '🛍️',
  },
  'cyber-monday': {
    background: 'bg-gradient-to-r from-blue-950 via-indigo-900 to-violet-950',
    accent: 'text-cyan-400',
    chip: 'bg-cyan-400',
    emoji: '💻',
  },
}

export const HolidaySaleBanner = () => {
  const sale = useActiveHolidaySale()
  if (!sale) return null
  return <HolidaySaleBannerContent key={sale.id} sale={sale} />
}

const HolidaySaleBannerContent = (props: { sale: HolidaySale }) => {
  const { sale } = props
  const [showBanner, hideBanner] = useBanner(sale.id)
  if (!showBanner) return null
  const style = HOLIDAY_SALE_BANNER_STYLES[sale.kind]
  return (
    <Banner
      className={clsx(style.background, 'items-center py-3 transition-colors')}
      link="/checkout"
      target="_self"
      setShowBanner={hideBanner}
      dismissIconClassName="text-white/70 hover:text-white"
    >
      <Row className="items-center gap-2">
        <span className="text-lg">{style.emoji}</span>
        <div className="font-medium text-white">
          <span className={clsx('font-bold', style.accent)}>{sale.name}:</span>{' '}
          {sale.manaDiscount === sale.shopDiscount ? (
            <>
              <span
                className={clsx(
                  style.chip,
                  'rounded px-2 py-0.5 font-bold text-gray-900'
                )}
              >
                {formatDiscountPercent(sale.manaDiscount)} off
              </span>{' '}
              mana and the shop
            </>
          ) : (
            <>
              {formatDiscountPercent(sale.manaDiscount)} off mana,{' '}
              {formatDiscountPercent(sale.shopDiscount)} off the shop
            </>
          )}
        </div>
        <ArrowRightIcon
          className={clsx('ml-1 h-4 w-4 shrink-0', style.accent)}
        />
      </Row>
    </Banner>
  )
}

export const CharityGiveawayBanner = () => {
  const [showBanner, hideBanner] = useBanner('charity-giveaway-2026')
  if (!showBanner) return null
  return (
    <Banner
      className="bg-primary-100 hover:bg-primary-200 text-ink-700 hover:text-ink-900 items-center py-2 transition-colors"
      link="/charity"
      target="_self"
      setShowBanner={hideBanner}
    >
      <Row className="items-center gap-2">
        <span>🎟️</span>
        <div>
          <span className="font-semibold">Charity is back!</span> Help your
          favorite charity win $1,000
        </div>
        <ArrowRightIcon className="ml-1 h-4 w-4" />
      </Row>
    </Banner>
  )
}

export const ShopBanner = () => {
  const [showBanner, hideBanner] = useBanner('prize-drawing-2026')
  if (!showBanner) return null
  return (
    <Banner
      className="items-center bg-gradient-to-r from-amber-100 to-green-100 py-2 transition-colors hover:from-amber-200 hover:to-green-200 dark:from-amber-900/30 dark:to-green-900/30 dark:hover:from-amber-900/50 dark:hover:to-green-900/50"
      link="/prize"
      target="_self"
      setShowBanner={hideBanner}
    >
      <Row className="items-center gap-2">
        <span>🎉</span>
        <div className="text-ink-700">
          <span className="font-semibold">Mana Shop is live!</span> Get
          membership perks, cosmetics & merch
        </div>
        <ArrowRightIcon className="text-ink-600 ml-1 h-4 w-4" />
      </Row>
    </Banner>
  )
}

export const PrizeDrawingBanner = () => {
  const [showBanner, hideBanner] = useBanner('prize-drawing-banner-2026')
  if (!showBanner) return null
  return (
    <Banner
      className="items-center bg-gradient-to-r from-amber-100 to-indigo-100 py-2 transition-colors hover:from-amber-200 hover:to-indigo-200 dark:from-amber-900/30 dark:to-indigo-900/30 dark:hover:from-amber-900/50 dark:hover:to-indigo-900/50"
      link="/prize"
      target="_self"
      setShowBanner={hideBanner}
    >
      <Row className="items-center gap-2">
        <span>🎁</span>
        <div className="text-ink-700">
          <span className="font-semibold">Prize Drawing!</span> Enter for a
          chance to win USDC prizes
        </div>
        <ArrowRightIcon className="text-ink-600 ml-1 h-4 w-4" />
      </Row>
    </Banner>
  )
}

// Disabled while we run bigger non-daily prize drawings. Keep around so we
// can re-enable / fork into a new campaign banner without re-writing the
// gradient + copy each time. To re-enable: uncomment and re-import in
// web/pages/home/index.tsx alongside <DowntimeBanner />.
/*
export const DailyPrizeDrawingBanner = () => {
  const [showBanner, hideBanner] = useBanner('daily-prize-drawing-100')
  if (!showBanner) return null
  return (
    <Banner
      className="items-center bg-gradient-to-r from-amber-100 via-yellow-100 to-emerald-100 py-2 transition-colors hover:from-amber-200 hover:via-yellow-200 hover:to-emerald-200 dark:from-amber-900/30 dark:via-yellow-900/30 dark:to-emerald-900/30 dark:hover:from-amber-900/50 dark:hover:via-yellow-900/50 dark:hover:to-emerald-900/50"
      link="/prize"
      target="_self"
      setShowBanner={hideBanner}
    >
      <Row className="items-center gap-2">
        <span>💰</span>
        <div className="text-ink-700">
          <span className="font-semibold">Daily $100 Prize Drawing!</span> Enter
          every day for a chance to win
        </div>
        <ArrowRightIcon className="text-ink-600 ml-1 h-4 w-4" />
      </Row>
    </Banner>
  )
}

export const PrizeDrawing2Banner = () => {
  const [showBanner, hideBanner] = useBanner('prize-drawing-2-banner')
  if (!showBanner) return null
  return (
    <Banner
      className="items-center bg-gradient-to-r from-amber-100 via-yellow-100 to-indigo-100 py-2 transition-colors hover:from-amber-200 hover:via-yellow-200 hover:to-indigo-200 dark:from-amber-900/30 dark:via-yellow-900/30 dark:to-indigo-900/30 dark:hover:from-amber-900/50 dark:hover:via-yellow-900/50 dark:hover:to-emerald-900/50"
      link="/prize/2"
      target="_self"
      setShowBanner={hideBanner}
    >
      <Row className="items-center gap-2">
        <span>🎁</span>
        <div className="text-ink-700">
          <span className="font-semibold">Prize Drawing #2 is live!</span> Win
          $10,000 in prizes
        </div>
        <ArrowRightIcon className="text-ink-600 ml-1 h-4 w-4" />
      </Row>
    </Banner>
  )
}
*/
