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
        default:
          return {}
      }
    }

    const hasDarkBackground = background && ['royalty', 'mana-printer', 'oracle', 'trading-floor'].includes(background)

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
          background === 'oracle') && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-md">
            {background === 'trading-floor' && <TradingFloorOverlay />}
            {background === 'mana-printer' && <ManaPrinterOverlay />}
            {background === 'oracle' && <StarfieldOverlay />}
          </div>
        )}
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
