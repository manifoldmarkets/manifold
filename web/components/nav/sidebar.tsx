import {
  ChatIcon,
  DeviceMobileIcon,
  GiftIcon,
  HeartIcon,
  LoginIcon,
  LogoutIcon,
  MoonIcon,
  QuestionMarkCircleIcon,
  SearchIcon,
  SparklesIcon,
  StarIcon,
  SunIcon,
} from '@heroicons/react/outline'
// import { PiTelevisionSimple } from 'react-icons/pi'
import clsx from 'clsx'
import { useState } from 'react'
import TrophyIcon from 'web/lib/icons/trophy-icon.svg'

import { buildArray } from 'common/util/array'
import { SHOP_ITEMS } from 'common/shop/items'
import { getTotalPrizePool, SweepstakesPrize } from 'common/sweepstakes'
import { DAY_MS, isAprilFools } from 'common/util/time'
import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LuGem } from 'react-icons/lu'
import { IoCompassOutline } from 'react-icons/io5'
import { AppBadgesOrGetAppButton } from 'web/components/buttons/app-badges-or-get-app-button'
import { CreateQuestionButton } from 'web/components/buttons/create-question-button'
import { NotificationsIcon } from 'web/components/notifications-icon'
import { useAdminOrMod } from 'web/hooks/use-admin'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useTheme } from 'web/hooks/use-theme'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin, firebaseLogout } from 'web/lib/firebase/users'
import { withTracking } from 'web/lib/service/analytics'
import { MobileAppsQRCodeDialog } from '../buttons/mobile-apps-qr-code-button'
import { SidebarSignUpButton } from '../buttons/sign-up-button'
import { Col } from '../layout/col'
import { AddFundsButton } from '../profile/add-funds-button'
import { ReportsIcon } from '../reports-icon'
import { LiveTVIcon } from '../tv-icon'
import { useTVIsLive } from '../tv/tv-schedule'
import { ManifoldLogo } from './manifold-logo'
import { ProfileSummary } from './profile-summary'
import { NavItem, SidebarItem } from './sidebar-item'

function formatPrizePoolLabel(
  prizes: SweepstakesPrize[] | undefined
): string | undefined {
  if (!prizes) return undefined
  const total = getTotalPrizePool(prizes)
  if (!Number.isFinite(total) || total <= 0) return undefined
  if (total < 1000) return `$${total}`
  const thousands = total / 1000
  return `$${thousands.toLocaleString(undefined, { maximumFractionDigits: 1 })}k`
}

export const SPEND_MANA_ENABLED = true

// Set to true to show a "$10k prize" badge on the Shop nav item (Prize Drawing #2)
const SHOW_SHOP_MANIFEST_BADGE = true

// Newest visibleSinceTime across all visible items. The sidebar NEW badge
// fires when this exceeds the current user's lastShopVisitTime.
const NEWEST_SHOP_ITEM_TIME = Math.max(
  0,
  ...SHOP_ITEMS.filter((i) => !i.hidden).map((i) => i.visibleSinceTime ?? 0)
)

const BADGE_COLORS = [
  'bg-red-500 text-white',
  'bg-amber-400 text-amber-900',
  'bg-green-500 text-white',
  'bg-blue-500 text-white',
  'bg-purple-500 text-white',
  'bg-pink-500 text-white',
  'bg-cyan-400 text-cyan-900',
  'bg-orange-500 text-white',
  'bg-indigo-500 text-white',
  'bg-emerald-500 text-white',
  'bg-rose-500 text-white',
  'bg-yellow-300 text-yellow-900',
  'bg-lime-400 text-lime-900',
  'bg-fuchsia-500 text-white',
  'bg-teal-500 text-white',
  'bg-sky-400 text-sky-900',
  'bg-violet-500 text-white',
  'bg-red-400 text-white',
  'bg-amber-500 text-white',
  'bg-green-400 text-white',
]

// Deterministic pseudo-random from seed
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

function AprilFoolsBadgeExplosion() {
  // Distribute badges in an elliptical spread around the button center,
  // evenly spaced by angle with some randomized jitter for personality.
  const cx = 70 // approx center of Shop button
  const cy = 16
  const count = BADGE_COLORS.length
  return (
    <>
      {BADGE_COLORS.map((color, i) => {
        const r = (n: number) => seededRandom(i * 7 + n)
        const angle = (i / count) * Math.PI * 2 + (r(1) - 0.5) * 0.5
        const radiusX = 55 + r(2) * 40
        const radiusY = 22 + r(3) * 16
        const x = cx + Math.cos(angle) * radiusX
        const y = cy + Math.sin(angle) * radiusY
        const rotation = r(4) * 40 - 20
        const scale = 0.65 + r(5) * 0.5
        return (
          <span
            key={i}
            className={clsx(
              'pointer-events-none absolute whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-bold',
              color
            )}
            style={{
              left: `${x}px`,
              top: `${y}px`,
              transform: `rotate(${rotation}deg) scale(${scale})`,
              zIndex: i,
            }}
          >
            NEW
          </span>
        )
      })}
    </>
  )
}

export default function Sidebar(props: {
  className?: string
  isMobile?: boolean
}) {
  const { className, isMobile } = props
  const router = useRouter()
  const currentPage = usePathname() ?? undefined
  const user = useUser()
  const isAdminOrMod = useAdminOrMod()
  const [isModalOpen, setIsModalOpen] = useState(false)

  const { theme, setTheme } = useTheme()

  const toggleTheme = () => {
    setTheme(theme === 'auto' ? 'dark' : theme === 'dark' ? 'light' : 'auto')
  }

  const isNewUser = !!user && user.createdTime > Date.now() - DAY_MS

  const isLiveTV = useTVIsLive(10)

  // Per-user NEW badge: shows once user data is loaded AND any visible shop
  // item became visible since the user last visited /shop. Default-to-hide
  // while user is loading prevents the badge from flashing in then out.
  const lastShopVisit = user?.lastShopVisitTime ?? user?.createdTime ?? 0
  const showShopNewBadge = !!user && NEWEST_SHOP_ITEM_TIME > lastShopVisit

  const { data: sweepstakesData } = useAPIGetter('get-sweepstakes', {})
  const prizePoolLabel = formatPrizePoolLabel(
    sweepstakesData?.sweepstakes?.prizes
  )

  const navOptions = isMobile
    ? getMobileNav(!!user, {
        isNewUser,
        isLiveTV,
        isAdminOrMod: isAdminOrMod,
        showShopNewBadge,
        prizePoolLabel,
      })
    : getDesktopNav(!!user, () => setIsModalOpen(true), {
        isNewUser,
        isLiveTV,
        isAdminOrMod: isAdminOrMod,
        showShopNewBadge,
        prizePoolLabel,
      })

  const bottomNavOptions = bottomNav(
    !!user,
    theme,
    toggleTheme,
    router,
    isMobile
  )

  const createMarketButton = user && !user.isBannedFromPosting && (
    <CreateQuestionButton
      key="create-market-button"
      className={'mt-4 w-full'}
    />
  )

  const addFundsButton = user && (
    <AddFundsButton
      userId={user.id}
      className="w-full whitespace-nowrap"
      size="xl"
    />
  )

  return (
    <nav
      aria-label="Sidebar"
      className={clsx('flex h-screen flex-col', className)}
    >
      <ManifoldLogo className="pb-3 pt-6" />

      {user && !isMobile && <ProfileSummary user={user} className="mb-3" />}

      <MobileAppsQRCodeDialog
        key="mobile-apps-qr-code"
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
      />
      <ul role="list" className="m-0 mb-4 flex list-none flex-col gap-1 p-0">
        {navOptions.map((item) => (
          <li key={item.name}>
            {item.name === 'Shop' && isAprilFools() ? (
              <div className="relative">
                <SidebarItem item={item} currentPage={currentPage} />
                <AprilFoolsBadgeExplosion />
              </div>
            ) : (
              <SidebarItem item={item} currentPage={currentPage} />
            )}
          </li>
        ))}
        {!user && (
          <li>
            <SidebarSignUpButton />
          </li>
        )}
        {(createMarketButton || addFundsButton) && (
          <li>
            <Col className="gap-2">
              {createMarketButton}
              {addFundsButton}
            </Col>
          </li>
        )}
      </ul>
      <ul
        role="list"
        className={clsx(
          'm-0 mb-6 mt-auto flex list-none flex-col gap-1 p-0',
          isMobile && 'pb-8'
        )}
      >
        {!!user && (
          <li className="list-none">
            <AppBadgesOrGetAppButton hideOnDesktop className="mb-2" />
          </li>
        )}
        {bottomNavOptions.map((item) => (
          <li key={item.name}>
            <SidebarItem item={item} currentPage={currentPage} />
          </li>
        ))}
      </ul>
    </nav>
  )
}

const getDesktopNav = (
  loggedIn: boolean,
  openDownloadApp: () => void,
  options: {
    isNewUser: boolean
    showShopNewBadge: boolean
    isLiveTV?: boolean
    isAdminOrMod: boolean
    prizePoolLabel?: string
  }
) => {
  const { isLiveTV } = options
  if (loggedIn)
    return buildArray(
      { name: 'Browse', href: '/home', icon: SearchIcon },
      {
        name: 'Explore',
        href: '/explore',
        icon: IoCompassOutline,
        iconClassName: '!h-[1.6rem] !w-[1.6rem] !mr-[0.65rem]',
      },
      isLiveTV && {
        name: 'TV',
        href: '/tv',
        icon: LiveTVIcon,
      },
      {
        name: 'Notifications',
        href: `/notifications`,
        icon: NotificationsIcon,
      },
      { name: 'Leagues', href: '/leagues', icon: TrophyIcon },
      {
        name: 'Forum',
        href: '/posts',
        icon: ChatIcon,
      },
      // Show shop when enabled OR for admins (testing)
      (SPEND_MANA_ENABLED || options.isAdminOrMod) && {
        name: 'Shop',
        href: '/shop',
        icon: LuGem,
        children:
          options.showShopNewBadge || SHOW_SHOP_MANIFEST_BADGE ? (
            <>
              Shop
              {/* NEW takes priority over Manifest — Manifest reappears once
                  the user has cleared the NEW badge by visiting /shop. */}
              {options.showShopNewBadge ? (
                <span className="ml-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                  NEW
                </span>
              ) : (
                SHOW_SHOP_MANIFEST_BADGE &&
                options.prizePoolLabel && (
                  <span className="ml-2 rounded-full bg-blue-500 px-2 py-0.5 text-xs font-medium text-white">
                    Prize {options.prizePoolLabel}
                  </span>
                )
              )}
            </>
          ) : undefined,
      },
      options.isAdminOrMod && {
        name: 'Reports',
        href: '/reports',
        icon: ReportsIcon,
      }
    )

  return buildArray(
    { name: 'Browse', href: '/', icon: SearchIcon },
    {
      name: 'Prize Drawing',
      href: '/prize',
      icon: GiftIcon,
      children: options.prizePoolLabel ? (
        <>
          Prize Drawing
          <span className="ml-2 rounded-full bg-green-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {options.prizePoolLabel}
          </span>
        </>
      ) : undefined,
    },
    { name: 'Predictle', href: '/predictle', icon: SparklesIcon },
    { name: 'About', href: '/about', icon: QuestionMarkCircleIcon },
    { name: 'App', onClick: openDownloadApp, icon: DeviceMobileIcon }
  )
}

const getMobileNav = (
  loggedIn: boolean,
  options: {
    isNewUser: boolean
    showShopNewBadge: boolean
    isLiveTV?: boolean
    isAdminOrMod: boolean
    prizePoolLabel?: string
  }
) => {
  const { isAdminOrMod, isLiveTV, showShopNewBadge, prizePoolLabel } = options

  return buildArray<NavItem>(
    {
      name: 'Prize Drawing',
      href: '/prize',
      icon: GiftIcon,
      children: prizePoolLabel ? (
        <>
          Prize Drawing
          <span className="ml-2 rounded-full bg-green-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {prizePoolLabel}
          </span>
        </>
      ) : undefined,
    },
    { name: 'Leagues', href: '/leagues', icon: TrophyIcon },
    { name: 'Forum', href: '/posts', icon: ChatIcon },
    { name: 'Charity', href: '/charity', icon: HeartIcon },
    loggedIn && {
      name: 'Referrals',
      href: '/referrals',
      icon: StarIcon,
    },
    isLiveTV && {
      name: 'TV',
      href: '/tv',
      icon: LiveTVIcon,
    },
    isAdminOrMod && {
      name: 'Reports',
      href: '/reports',
      icon: ReportsIcon,
    },
    // Show shop when enabled OR for admins (testing). On mobile we omit the
    // "$10k prize" pill because the Prize Drawing tab above already advertises
    // it — the duplicate is redundant in the vertical mobile nav.
    (SPEND_MANA_ENABLED || isAdminOrMod) && {
      name: 'Shop',
      href: '/shop',
      icon: LuGem,
      children: showShopNewBadge ? (
        <>
          Shop
          <span className="ml-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
            NEW
          </span>
        </>
      ) : undefined,
    }
  )
}

const bottomNav = (
  loggedIn: boolean,
  theme: 'light' | 'dark' | 'auto',
  toggleTheme: () => void,
  router: AppRouterInstance,
  isMobile: boolean | undefined
) =>
  buildArray<NavItem>(
    loggedIn && { name: 'About', href: '/about', icon: QuestionMarkCircleIcon },
    loggedIn &&
      !isMobile && {
        name: 'Referrals',
        href: '/referrals',
        icon: StarIcon,
      },
    {
      name: theme ?? 'auto',
      children:
        theme === 'light' ? (
          'Light'
        ) : theme === 'dark' ? (
          'Dark'
        ) : (
          <>
            <span className="hidden dark:inline">Dark</span>
            <span className="inline dark:hidden">Light</span> (auto)
          </>
        ),
      icon: ({ className, ...props }) => (
        <>
          <MoonIcon
            className={clsx(className, 'hidden dark:block')}
            {...props}
          />
          <SunIcon
            className={clsx(className, 'block dark:hidden')}
            {...props}
          />
        </>
      ),
      onClick: toggleTheme,
    },
    loggedIn && {
      name: 'Sign out',
      icon: LogoutIcon,
      onClick: async () => {
        await withTracking(firebaseLogout, 'sign out')()
        await router.refresh()
      },
    },
    !loggedIn && { name: 'Sign in', icon: LoginIcon, onClick: firebaseLogin }
  )
