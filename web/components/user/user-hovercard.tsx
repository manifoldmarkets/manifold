import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  safePolygon,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
} from '@floating-ui/react'
import clsx from 'clsx'
import { FullUser } from 'common/api/user-types'
import {
  userHasHovercardGlow,
  userHasHovercardSpinningBorder,
  userHasHovercardRoyalBorder,
  getActiveHovercardBackground,
  HovercardBackground,
  userHasGoldenFollowButton,
  userHasCharityChampionTrophy,
} from 'common/shop/items'
import dayjs from 'dayjs'
import { Ref, forwardRef, useEffect, useState } from 'react'
import { SimpleCopyTextButton } from 'web/components/buttons/copy-link-button'
import { useAdminOrMod } from 'web/hooks/use-admin'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useFollowers, useFollows } from 'web/hooks/use-follows'
import { useUserBans } from 'web/hooks/use-user-bans'
import { getFullUserById } from 'web/lib/supabase/users'
import { FollowButton } from '../buttons/follow-button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import SuperBanControl from '../SuperBanControl'
import { Avatar } from '../widgets/avatar'
import { Linkify } from '../widgets/linkify'
import { StackedUserNames } from '../widgets/user-link'

export type UserHovercardProps = {
  children: React.ReactNode
  userId: string
  className?: string | undefined
}

function formatLastActive(lastActiveTime: number) {
  if (lastActiveTime === 0) return 'Never'

  const now = dayjs()
  const lastActiveDate = dayjs(lastActiveTime)
  const days = now.diff(lastActiveDate, 'day')

  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days <= 7) return `${days} days ago`
  if (days <= 30) {
    const weeks = Math.floor(days / 7)
    if (weeks === 1) return '1 week ago'
    return `${weeks} weeks ago`
  }
  if (days <= 365) {
    const months = Math.floor(days / 30)
    if (months === 1) return '1 month ago'
    if (months <= 12) return `${months} months ago`
    return 'in the last year'
  }
  return 'over a year'
}

export function UserHovercard({
  children,
  userId,
  className,
}: UserHovercardProps) {
  const [open, setOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (newOpen) => {
      // Don't close while modal is open
      if (!newOpen && modalOpen) return
      setOpen(newOpen)
    },
    whileElementsMounted: autoUpdate,
    placement: 'bottom-start',
    middleware: [offset(8), flip(), shift({ padding: 4 })],
    strategy: 'fixed',
  })

  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context, {
      delay: { open: 150, close: 300 },
      handleClose: safePolygon({ buffer: -0.5 }),
      enabled: !modalOpen,
    }),
    useFocus(context),
    useDismiss(context, { enabled: !modalOpen }),
    useRole(context, { role: 'dialog' }),
  ])

  return (
    <>
      <button
        ref={refs.setReference}
        className={clsx('inline-flex', className)}
        {...getReferenceProps()}
      >
        {children}
      </button>
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            className="fixed z-[60]"
            style={floatingStyles}
            {...getFloatingProps()}
          >
            <FetchUserHovercardContent
              userId={userId}
              onModalOpenChange={setModalOpen}
            />
          </div>
        </FloatingPortal>
      )}
    </>
  )
}

const FetchUserHovercardContent = forwardRef(
  (
    {
      userId,
      onModalOpenChange,
    }: { userId: string; onModalOpenChange?: (open: boolean) => void },
    ref: Ref<HTMLDivElement>
  ) => {
    const [user, setUser] = useState<FullUser | null>(null)
    const { bans: userBans } = useUserBans(userId)

    useEffect(() => {
      getFullUserById(userId).then(setUser)
    }, [userId])

    const followingIds = useFollows(userId)
    const followerIds = useFollowers(userId)
    const isMod = useAdminOrMod()
    const { data: lastActiveData } = useAPIGetter('get-user-last-active-time', {
      userId,
    })
    const lastActiveTime = Math.max(
      lastActiveData?.lastActiveTime ?? 0,
      user?.lastBetTime ?? 0
    )

    const hasGlow = userHasHovercardGlow(user?.entitlements)
    const hasSpinningBorder = userHasHovercardSpinningBorder(user?.entitlements)
    const hasRoyalBorder = userHasHovercardRoyalBorder(user?.entitlements)
    const background = getActiveHovercardBackground(user?.entitlements)
    const hasChampionTrophy = userHasCharityChampionTrophy(user?.entitlements)

    // Get background styles based on active background
    const getBackgroundStyle = (
      bg: HovercardBackground | null
    ): React.CSSProperties => {
      switch (bg) {
        case 'royalty':
          return {
            background:
              'linear-gradient(135deg, #1a0a2e 0%, #2d1b4e 50%, #1a0a2e 100%)',
          }
        case 'mana-printer':
          return {
            background:
              'linear-gradient(135deg, #0a2e1a 0%, #1b4e2d 50%, #0a2e1a 100%)',
          }
        case 'oracle':
          return {
            background:
              'radial-gradient(ellipse at top, #1a1a3e 0%, #0a0a1e 50%, #000010 100%)',
          }
        case 'trading-floor':
          return {
            background:
              'linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%)',
          }
        case 'champions-legacy':
          return {
            background:
              'linear-gradient(135deg, #2a1a00 0%, #1a1000 50%, #2a1a00 100%)',
          }
        default:
          return {}
      }
    }

    const hasDarkBackground = background && ['royalty', 'mana-printer', 'oracle', 'trading-floor', 'champions-legacy'].includes(background)

    return user ? (
      <div
        ref={ref}
        className={clsx(
          'animate-slide-up-and-fade divide-ink-300 z-30 w-56 divide-y rounded-md shadow-lg focus:outline-none',
          !background && 'bg-canvas-0 text-ink-1000',
          background === 'royalty' && 'text-amber-50',
          background === 'mana-printer' && 'text-emerald-50',
          background === 'oracle' && 'text-indigo-50',
          background === 'trading-floor' && 'text-green-50',
          background === 'champions-legacy' && 'text-amber-50',
          hasDarkBackground && 'divide-white/20',
          hasSpinningBorder
            ? 'hovercard-spinning-border'
            : hasRoyalBorder
            ? 'hovercard-royal-border'
            : hasGlow
            ? 'shadow-[0_0_15px_rgba(167,139,250,0.5)] ring-2 ring-violet-400'
            : 'ring-ink-1000 ring-1 ring-opacity-5'
        )}
        style={{ ...getBackgroundStyle(background), position: 'relative' }}
      >
        {/* Background visual overlays - contained in clipped wrapper */}
        {(background === 'trading-floor' ||
          background === 'mana-printer' ||
          background === 'oracle' ||
          background === 'champions-legacy') && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-md">
            {background === 'trading-floor' && <TradingFloorOverlay />}
            {background === 'mana-printer' && <ManaPrinterOverlay />}
            {background === 'oracle' && <StarfieldOverlay />}
            {background === 'champions-legacy' && <ChampionsLegacyOverlay />}
          </div>
        )}
        {/* Floating 3D trophy for current Charity Champion */}
        {hasChampionTrophy && <FloatingTrophy />}
        <div className="relative z-10 px-4 py-3">
          <Row className="items-start justify-between">
            <div className="group">
              <Avatar
                username={user.username}
                avatarUrl={user.avatarUrl}
                size="lg"
                entitlements={user.entitlements}
                displayContext="hovercard"
              />
            </div>
            <FollowButton
                  userId={userId}
                  size="xs"
                  golden={userHasGoldenFollowButton(user?.entitlements)}
                />
          </Row>

          <StackedUserNames
            usernameClassName={'text-base'}
            className={'text-lg font-bold'}
            user={user}
            followsYou={false}
            displayContext="hovercard"
            bans={userBans}
          />

          {user.bio && (
            <div className="sm:text-md mt-1 line-clamp-5 text-sm">
              <Linkify text={user.bio}></Linkify>
            </div>
          )}

          <Col className="mt-3 gap-1">
            <Row className="gap-4 text-sm">
              <div>
                <span className="font-semibold">
                  {followingIds?.length ?? ''}
                </span>{' '}
                Following
              </div>
              <div>
                <span className="font-semibold">
                  {followerIds?.length ?? ''}
                </span>{' '}
                Followers
              </div>
            </Row>

            <Row className="gap-4 text-sm">
              <div className={hasDarkBackground ? 'opacity-70' : 'text-ink-400'}>
                Joined {dayjs(user.createdTime).format('MMM DD, YYYY')}
              </div>
              {isMod && (
                <SimpleCopyTextButton
                  text={user.id}
                  tooltip="Copy user id"
                  className="!px-1 !py-px"
                  eventTrackingName={'admin copy user id'}
                />
              )}
            </Row>
          </Col>
        </div>

        <div className="relative z-10 py-1">
          <Row className="items-center justify-between px-4 py-2">
            <div className={clsx('text-sm', hasDarkBackground ? 'opacity-80' : 'text-ink-700')}>
              <span className="font-semibold">Last active:</span>{' '}
              {formatLastActive(lastActiveTime)}
            </div>
            {isMod && (
              <SuperBanControl
                userId={userId}
                onModalOpenChange={onModalOpenChange}
              />
            )}
          </Row>
        </div>
      </div>
    ) : null
  }
)

// Trading Floor background overlay - clean stonks chart
function TradingFloorOverlay() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 224 200"
      preserveAspectRatio="xMidYMid slice"
    >
      {/* Area fill under the chart */}
      <defs>
        <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#22C55E" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#22C55E" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points="0,160 30,145 55,155 80,130 105,140 135,110 160,120 190,100 224,85 224,200 0,200"
        fill="url(#areaGradient)"
      />

      {/* Main stonks line chart */}
      <polyline
        points="0,160 30,145 55,155 80,130 105,140 135,110 160,120 190,100 224,85"
        fill="none"
        stroke="#22C55E"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.3"
      />

      {/* Upward arrow indicator - points at Follow button */}
      <g transform="translate(150, 55)" opacity="0.25">
        <polygon points="12,0 24,16 18,16 18,28 6,28 6,16 0,16" fill="#22C55E" />
      </g>
    </svg>
  )
}

// Mana Printer background overlay - centered figure turning crank, coins pouring out
function ManaPrinterOverlay() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 224 200"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="coin-gradient-brrr" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#C4B5FD" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <g opacity="0.35">
        {/* Stick figure - turning crank */}
        <circle cx="85" cy="105" r="10" stroke="#C4B5FD" strokeWidth="2" fill="none" />
        <line x1="85" y1="115" x2="85" y2="145" stroke="#C4B5FD" strokeWidth="2" />
        <line x1="85" y1="145" x2="75" y2="168" stroke="#C4B5FD" strokeWidth="2" />
        <line x1="85" y1="145" x2="95" y2="168" stroke="#C4B5FD" strokeWidth="2" />
        <line x1="85" y1="125" x2="118" y2="118" stroke="#C4B5FD" strokeWidth="2" />
        <line x1="85" y1="125" x2="70" y2="138" stroke="#C4B5FD" strokeWidth="2" />

        {/* Machine */}
        <rect
          x="120"
          y="100"
          width="50"
          height="45"
          rx="3"
          stroke="#A78BFA"
          strokeWidth="2"
          fill="#8B5CF6"
          fillOpacity="0.1"
        />
        {/* Crank wheel */}
        <circle cx="130" cy="118" r="8" stroke="#A78BFA" strokeWidth="2" fill="none" />
        <line x1="130" y1="118" x2="118" y2="118" stroke="#A78BFA" strokeWidth="2" />
        {/* Output slot */}
        <rect x="165" y="115" width="6" height="18" fill="#A78BFA" fillOpacity="0.4" rx="1" />

        {/* Mana coins with gradient and white M */}
        <g>
          {/* Coin 1 - exiting slot */}
          <g transform="translate(178, 120)">
            <circle r="10" fill="url(#coin-gradient-brrr)" stroke="#7C3AED" strokeWidth="2" />
            <text x="0" y="4" fontSize="12" fontWeight="bold" fill="white" textAnchor="middle">M</text>
          </g>
          {/* Coin 2 */}
          <g transform="translate(190, 145)" opacity="0.9">
            <circle r="9" fill="url(#coin-gradient-brrr)" stroke="#7C3AED" strokeWidth="1.5" />
            <text x="0" y="3.5" fontSize="11" fontWeight="bold" fill="white" textAnchor="middle">M</text>
          </g>
          {/* Coin 3 */}
          <g transform="translate(200, 168)" opacity="0.8">
            <circle r="8" fill="url(#coin-gradient-brrr)" stroke="#7C3AED" strokeWidth="1.5" />
            <text x="0" y="3" fontSize="10" fontWeight="bold" fill="white" textAnchor="middle">M</text>
          </g>
          {/* Coin 4 */}
          <g transform="translate(185, 188)" opacity="0.7">
            <circle r="7" fill="url(#coin-gradient-brrr)" stroke="#7C3AED" strokeWidth="1" />
            <text x="0" y="2.5" fontSize="9" fontWeight="bold" fill="white" textAnchor="middle">M</text>
          </g>
        </g>

        {/* Motion lines */}
        <path d="M140 95 L148 90" stroke="#C4B5FD" strokeWidth="1" />
        <path d="M142 100 L150 95" stroke="#C4B5FD" strokeWidth="0.75" />
      </g>
    </svg>
  )
}

// Champion's Legacy background overlay - golden trophies and laurels
function ChampionsLegacyOverlay() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 224 200"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id="cl-glow" cx="50%" cy="100%" r="100%" fx="50%" fy="100%">
          <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.15" />
          <stop offset="60%" stopColor="#B45309" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#B45309" stopOpacity="0" />
        </radialGradient>
        <symbol id="cl-trophy" viewBox="0 0 100 100">
          <path d="M20 10h60l-5 30c0 20-15 25-25 25s-25-5-25-25l-5-30z M45 65v15h-10l-5 10h40l-5-10h-10v-15h-10z M80 15c15 0 15 25 0 25v-5c8 0 8-15 0-15v-5z M20 15c-15 0-15 25 0 25v-5c-8 0-8-15 0-15v-5z" fill="currentColor" />
        </symbol>
        <symbol id="cl-star" viewBox="0 0 20 20">
          <path d="M10 0l2.5 7.5h7.5l-6 4.5 2.5 7.5-6-4.5-6 4.5 2.5-7.5-6-4.5h7.5z" fill="currentColor" />
        </symbol>
      </defs>

      {/* Center radial glow */}
      <rect width="224" height="200" fill="url(#cl-glow)" />

      {/* Main trophy — centered */}
      <use href="#cl-trophy" x="62" y="40" width="100" height="100" transform="rotate(8 112 90)" fill="#B45309" fillOpacity="0.07" />
      {/* Small accent trophies — corners, away from laurels */}
      <use href="#cl-trophy" x="155" y="5" width="55" height="55" transform="rotate(-10 182 32)" fill="#D97706" fillOpacity="0.05" />
      <use href="#cl-trophy" x="5" y="5" width="50" height="50" transform="rotate(12 30 30)" fill="#D97706" fillOpacity="0.04" />

      {/* Laurel wreath accents — bottom corners */}
      <path d="M15 190 C30 170 38 145 42 120" stroke="#D97706" strokeWidth="2" strokeOpacity="0.1" fill="none" />
      <path d="M209 190 C194 170 186 145 182 120" stroke="#D97706" strokeWidth="2" strokeOpacity="0.1" fill="none" />
      {/* Leaves */}
      <g fill="#F59E0B" fillOpacity="0.1">
        <path d="M36 148 Q22 152 18 140 Q28 136 36 148" />
        <path d="M39 130 Q26 134 22 122 Q32 118 39 130" />
        <path d="M188 148 Q202 152 206 140 Q196 136 188 148" />
        <path d="M185 130 Q198 134 202 122 Q192 118 185 130" />
      </g>

      {/* Stars/sparkles */}
      <use href="#cl-star" x="100" y="20" width="12" height="12" fill="#FBBF24" fillOpacity="0.2" />
      <use href="#cl-star" x="30" y="70" width="8" height="8" fill="#F59E0B" fillOpacity="0.12" />
      <use href="#cl-star" x="185" y="80" width="6" height="6" fill="#F59E0B" fillOpacity="0.12" />
      <use href="#cl-star" x="80" y="170" width="5" height="5" fill="#B45309" fillOpacity="0.1" />
    </svg>
  )
}

// Floating 3D trophy for current Charity Champion holders
function FloatingTrophy() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center overflow-hidden" style={{ justifyContent: 'right', paddingRight: '5%' }}>
      <style>
        {`
          @keyframes trophy-float {
            0%, 100% { transform: translateY(0px) rotate(-4deg); }
            50% { transform: translateY(-18px) rotate(4deg); }
          }
        `}
      </style>
      <div className="absolute h-24 w-24 rounded-full bg-amber-400/20 blur-2xl" />
      <div
        className="relative flex items-center justify-center"
        style={{ animation: 'trophy-float 6s ease-in-out infinite' }}
      >
        <svg width="92" height="92" viewBox="0 0 80 80" fill="none">
          <defs>
            <linearGradient
              id="ft-gold-gradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#B45309" />
              <stop offset="25%" stopColor="#D97706" />
              <stop offset="50%" stopColor="#FBBF24" />
              <stop offset="75%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#B45309" />
            </linearGradient>
            <radialGradient
              id="ft-specular-shine"
              cx="30%"
              cy="30%"
              r="40%"
            >
              <stop offset="0%" stopColor="white" stopOpacity="0.7" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </radialGradient>
            <linearGradient
              id="ft-stem-gradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#D97706" />
              <stop offset="50%" stopColor="#FBBF24" />
              <stop offset="100%" stopColor="#D97706" />
            </linearGradient>
          </defs>
          {/* Handles — flat top then curve down to meet bowl */}
          <path
            d="M24 25L18 25C13 25 16 44 29 44"
            stroke="url(#ft-gold-gradient)"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M56 25L62 25C67 25 64 44 51 44"
            stroke="url(#ft-gold-gradient)"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
          {/* Gap filler — semi-transparent in dark mode */}
          <path
            className="dark:opacity-50"
            d="M24 20C24 20 24 50 40 50C56 50 56 20 56 20Z"
            fill="url(#ft-gold-gradient)"
          />
          {/* Bowl body — gapped path for shadow effect on dark backgrounds */}
          <path
            d="M24 20C24 20 24 50 40 50C56 50 56 20 24 20Z"
            fill="url(#ft-gold-gradient)"
          />
          {/* Bowl Opening */}
          <ellipse
            cx="40"
            cy="20"
            rx="16"
            ry="4"
            fill="#FBBF24"
            stroke="#D97706"
            strokeWidth="0.5"
          />
          <ellipse
            cx="40"
            cy="21"
            rx="14"
            ry="2.5"
            fill="#B45309"
            fillOpacity="0.2"
          />
          {/* Specular Highlights */}
          <ellipse
            cx="32"
            cy="30"
            rx="4"
            ry="8"
            fill="url(#ft-specular-shine)"
            transform="rotate(-15, 32, 30)"
          />
          {/* Stem */}
          <rect
            x="37"
            y="50"
            width="6"
            height="15"
            fill="url(#ft-stem-gradient)"
          />
          <path
            d="M37 50L35 55H45L43 50H37Z"
            fill="#D97706"
            fillOpacity="0.5"
          />
          {/* Base */}
          <rect
            x="26"
            y="65"
            width="28"
            height="6"
            rx="1.5"
            fill="url(#ft-gold-gradient)"
          />
          <rect x="22" y="71" width="36" height="5" rx="1" fill="#B45309" />
          {/* Rim Polish */}
          <path
            d="M24 20C28 23 52 23 56 20"
            stroke="white"
            strokeOpacity="0.4"
            strokeWidth="0.5"
          />
        </svg>
      </div>
    </div>
  )
}

// Starfield background overlay - stars and space
function StarfieldOverlay() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 224 200"
      preserveAspectRatio="xMidYMid slice"
    >
      {/* Small stars scattered around */}
      <g fill="white">
        {/* Tiny stars */}
        <circle cx="20" cy="25" r="0.8" opacity="0.6" />
        <circle cx="50" cy="15" r="0.6" opacity="0.5" />
        <circle cx="80" cy="35" r="0.7" opacity="0.55" />
        <circle cx="120" cy="20" r="0.8" opacity="0.6" />
        <circle cx="160" cy="30" r="0.6" opacity="0.5" />
        <circle cx="200" cy="18" r="0.7" opacity="0.55" />
        <circle cx="35" cy="60" r="0.6" opacity="0.45" />
        <circle cx="95" cy="55" r="0.7" opacity="0.5" />
        <circle cx="145" cy="65" r="0.6" opacity="0.45" />
        <circle cx="185" cy="50" r="0.8" opacity="0.55" />
        <circle cx="15" cy="100" r="0.6" opacity="0.4" />
        <circle cx="65" cy="90" r="0.7" opacity="0.45" />
        <circle cx="110" cy="85" r="0.6" opacity="0.4" />
        <circle cx="170" cy="95" r="0.7" opacity="0.45" />
        <circle cx="210" cy="80" r="0.6" opacity="0.4" />
        <circle cx="40" cy="130" r="0.6" opacity="0.35" />
        <circle cx="90" cy="125" r="0.7" opacity="0.4" />
        <circle cx="140" cy="135" r="0.6" opacity="0.35" />
        <circle cx="195" cy="120" r="0.7" opacity="0.4" />
        <circle cx="25" cy="165" r="0.6" opacity="0.3" />
        <circle cx="75" cy="155" r="0.6" opacity="0.35" />
        <circle cx="125" cy="170" r="0.7" opacity="0.3" />
        <circle cx="180" cy="160" r="0.6" opacity="0.35" />
        <circle cx="215" cy="150" r="0.6" opacity="0.3" />

        {/* Medium brighter stars */}
        <circle cx="45" cy="40" r="1.2" opacity="0.7" />
        <circle cx="175" cy="45" r="1.1" opacity="0.65" />
        <circle cx="100" cy="70" r="1.0" opacity="0.6" />
        <circle cx="55" cy="115" r="1.1" opacity="0.5" />
        <circle cx="155" cy="105" r="1.2" opacity="0.55" />
        <circle cx="200" cy="145" r="1.0" opacity="0.45" />

        {/* Larger prominent stars with glow effect */}
        <circle cx="130" cy="25" r="1.5" opacity="0.8" filter="blur(0.5px)" />
        <circle cx="130" cy="25" r="0.8" opacity="1" />
        <circle cx="30" cy="85" r="1.4" opacity="0.7" filter="blur(0.5px)" />
        <circle cx="30" cy="85" r="0.7" opacity="0.95" />
        <circle cx="190" cy="75" r="1.3" opacity="0.65" filter="blur(0.5px)" />
        <circle cx="190" cy="75" r="0.6" opacity="0.9" />
      </g>

      {/* Subtle purple nebula hints */}
      <g opacity="0.08">
        <ellipse cx="60" cy="50" rx="40" ry="25" fill="#8B5CF6" filter="blur(10px)" />
        <ellipse cx="180" cy="120" rx="35" ry="20" fill="#6366F1" filter="blur(8px)" />
      </g>
    </svg>
  )
}
