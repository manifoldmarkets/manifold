import clsx from 'clsx'
import Link from 'next/link'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { FaLock, FaTrophy } from 'react-icons/fa6'
import { CHARITY_CHAMPION_ENTITLEMENT_ID } from 'common/shop/items'
import { UserEntitlement } from 'common/shop/types'
import { User } from 'common/user'
import { api } from 'web/lib/api/api'
import { Button } from '../buttons/button'
import { Card } from '../widgets/card'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import { RelativeTimestamp } from '../relative-timestamp'
import { UserHovercard } from '../user/user-hovercard'
import { CharityGiveawayData } from './charity-giveaway-card'

export function CharityChampionCard(props: {
  data?: CharityGiveawayData
  isLoading?: boolean
  user?: User | null
  className?: string
  entitlements?: UserEntitlement[]
  onEntitlementsChange?: (entitlements: UserEntitlement[]) => void
}) {
  const { data, isLoading = false, user, className, entitlements, onEntitlementsChange } = props
  const [claiming, setClaiming] = useState(false)
  const [toggling, setToggling] = useState(false)

  const giveaway = data?.giveaway
  const champion = data?.champion
  const trophyHolder = data?.trophyHolder
  const previousTrophyHolder = data?.previousTrophyHolder

  // Show loading skeleton while data is being fetched
  if (isLoading) {
    return (
      <Card
        className={clsx(
          'relative flex flex-col gap-3 p-4',
          'bg-gradient-to-br from-gray-50/50 via-gray-50/30 to-gray-50/50 dark:from-gray-900/20 dark:via-gray-900/15 dark:to-gray-900/20',
          className
        )}
      >
        <div className="animate-pulse">
          <Row className="mb-3 items-center gap-2">
            <div className="h-5 w-5 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-5 w-40 rounded bg-gray-200 dark:bg-gray-700" />
          </Row>
          <div className="mb-3 h-10 w-full rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mb-3 rounded-lg bg-white/60 p-3 dark:bg-gray-800/60">
            <div className="mb-2 h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
            <Row className="items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700" />
              <Col className="flex-1 gap-1">
                <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-3 w-16 rounded bg-gray-200 dark:bg-gray-700" />
              </Col>
            </Row>
          </div>
          <div className="h-8 w-full rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </Card>
    )
  }

  // No giveaway data available - don't render card
  if (!giveaway) {
    return null
  }

  const isCurrentUserChampion = user && champion && user.id === champion.id

  // Check if user has the trophy entitlement
  const trophyEntitlement = entitlements?.find(
    (e) => e.entitlementId === CHARITY_CHAMPION_ENTITLEMENT_ID
  )
  const hasTrophy = !!trophyEntitlement
  const isTrophyEnabled = trophyEntitlement?.enabled ?? false

  const handleClaim = async () => {
    if (!user || !isCurrentUserChampion) return

    setClaiming(true)
    try {
      const result = await api('claim-charity-champion', { enabled: true })
      if (result.success) {
        toast.success('Claimed Charity Champion Trophy!')
        onEntitlementsChange?.(result.entitlements as UserEntitlement[])
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to claim trophy')
    } finally {
      setClaiming(false)
    }
  }

  const handleToggle = async () => {
    if (!user || !hasTrophy) return

    const newEnabled = !isTrophyEnabled
    setToggling(true)
    try {
      const result = await api('shop-toggle', { itemId: 'charity-champion-trophy', enabled: newEnabled })
      if (result.success) {
        toast.success(newEnabled ? 'Trophy enabled' : 'Trophy disabled')
        onEntitlementsChange?.(result.entitlements as UserEntitlement[])
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to toggle trophy')
    } finally {
      setToggling(false)
    }
  }

  return (
    <Card
      className={clsx(
        'relative flex flex-col gap-2 overflow-hidden p-4 transition-all duration-200',
        'bg-gradient-to-br from-amber-50/50 via-yellow-50/30 to-orange-50/50 dark:from-amber-900/20 dark:via-yellow-900/15 dark:to-orange-900/20',
        'hover:ring-2 hover:ring-amber-500 hover:shadow-xl hover:shadow-amber-200/50 hover:-translate-y-1 dark:hover:shadow-amber-900/30',
        className
      )}
    >
      {/* Floating trophy background decoration */}
      <ShopCardFloatingTrophy />

      {/* Header */}
      <Row className="items-center gap-2">
        <FaTrophy className="h-5 w-5 shrink-0 text-amber-500" />
        <span className="text-lg font-semibold text-amber-700 dark:text-amber-400">
          Champion Trophy
        </span>
      </Row>

      {/* Current trophy holder section */}
      <div className="rounded-lg bg-white/60 px-3 py-2 dark:bg-gray-800/60">
        {trophyHolder ? (
          <Link href={`/${trophyHolder.username}`} className="block">
            <Row className="items-center gap-2 transition-opacity hover:opacity-80">
              <Avatar
                avatarUrl={trophyHolder.avatarUrl}
                username={trophyHolder.username}
                size="xs"
                noLink
                className="ring-2 ring-amber-400"
              />
              <Col className="min-w-0 flex-1">
                <Row className="items-center gap-1">
                  <UserHovercard userId={trophyHolder.id}>
                    <span className="truncate text-sm font-semibold text-amber-700 hover:underline dark:text-amber-400">
                      {trophyHolder.name}
                    </span>
                  </UserHovercard>
                  <FaTrophy
                    className="h-3 w-3 shrink-0 text-amber-500"
                    style={{ filter: 'drop-shadow(0 0 2px rgba(245, 158, 11, 0.4))' }}
                  />
                </Row>
              </Col>
              <span className="shrink-0 text-sm font-bold text-amber-600">
                {Math.floor(trophyHolder.totalTickets).toLocaleString()}
              </span>
            </Row>
            <div className="text-ink-400 mt-1 text-xs">
              Held since <RelativeTimestamp time={trophyHolder.claimedTime} />
            </div>
            {previousTrophyHolder && (
              <div className="text-ink-400 text-xs">
                Previously{' '}
                <UserHovercard userId={previousTrophyHolder.id}>
                  <Link
                    href={`/${previousTrophyHolder.username}`}
                    className="font-semibold text-amber-600 hover:underline dark:text-amber-400"
                    onClick={(e) => e.stopPropagation()}
                  >
                    @{previousTrophyHolder.username}
                  </Link>
                </UserHovercard>
              </div>
            )}
          </Link>
        ) : (
          <Row className="items-center gap-2">
            <div className="h-6 w-6 shrink-0 rounded-full bg-gray-200 ring-2 ring-gray-300 dark:bg-gray-700 dark:ring-gray-600" />
            <span className="text-ink-400 text-sm italic">Unclaimed</span>
          </Row>
        )}
      </div>

      {/* Description */}
      <p className="text-ink-500 text-xs">
        Reserved for the #1 ticket buyer in the charity raffle.
      </p>

      {/* Footer */}
      <Col className="mt-auto pt-1">
        {hasTrophy ? (
          // Has trophy - show toggle (even if outbid)
          <Row className="items-center justify-center gap-3">
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={isTrophyEnabled}
                onChange={handleToggle}
                disabled={toggling}
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-gray-300 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-amber-500 peer-checked:after:translate-x-full dark:bg-gray-600" />
              <span className="text-ink-700 ml-2 text-sm">
                {isTrophyEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          </Row>
        ) : isCurrentUserChampion ? (
          // Champion but hasn't claimed - show claim button
          <Button
            color="amber"
            size="sm"
            className="w-full"
            onClick={handleClaim}
            loading={claiming}
          >
            <FaTrophy className="mr-2 h-4 w-4" />
            Claim Trophy
          </Button>
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-lg bg-gray-100 py-2 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            <FaLock className="h-3 w-3" />
            <span>
              {champion
                ? `Outbid @${champion.username} to claim`
                : 'Buy raffle tickets to claim'}
            </span>
          </div>
        )}
      </Col>
    </Card>
  )
}

function ShopCardFloatingTrophy() {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center overflow-hidden"
      style={{ justifyContent: 'right', paddingRight: '3%' }}
    >
      <style>
        {`
          @keyframes sc-trophy-float {
            0%, 100% { transform: translateY(0px) rotate(-4deg); }
            50% { transform: translateY(-10px) rotate(4deg); }
          }
        `}
      </style>
      <div className="absolute h-20 w-20 rounded-full bg-amber-400/15 blur-2xl" />
      <div
        className="relative flex items-center justify-center opacity-40"
        style={{ animation: 'sc-trophy-float 6s ease-in-out infinite' }}
      >
        <svg width="96" height="96" viewBox="0 0 80 80" fill="none">
          <defs>
            <linearGradient id="sc-g" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#B45309" />
              <stop offset="25%" stopColor="#D97706" />
              <stop offset="50%" stopColor="#FBBF24" />
              <stop offset="75%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#B45309" />
            </linearGradient>
            <linearGradient id="sc-st" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#D97706" />
              <stop offset="50%" stopColor="#FBBF24" />
              <stop offset="100%" stopColor="#D97706" />
            </linearGradient>
          </defs>
          {/* Handles — flat top then curve down to meet bowl */}
          <path d="M24 25L18 25C13 25 16 44 29 44" stroke="url(#sc-g)" strokeWidth="3" strokeLinecap="round" fill="none" />
          <path d="M56 25L62 25C67 25 64 44 51 44" stroke="url(#sc-g)" strokeWidth="3" strokeLinecap="round" fill="none" />
          {/* Light-mode gap filler — hidden in dark mode where the gap creates a natural shadow */}
          <path className="dark:opacity-50" d="M24 20C24 20 24 50 40 50C56 50 56 20 56 20Z" fill="url(#sc-g)" />
          {/* Bowl body — original path with shadow gaps on dark backgrounds */}
          <path d="M24 20C24 20 24 50 40 50C56 50 56 20 24 20Z" fill="url(#sc-g)" />
          {/* Bowl opening */}
          <ellipse cx="40" cy="20" rx="16" ry="4" fill="#FBBF24" stroke="#D97706" strokeWidth="0.5" />
          <ellipse cx="40" cy="21" rx="14" ry="2.5" fill="#B45309" fillOpacity="0.2" />
          {/* Stem */}
          <rect x="37" y="50" width="6" height="15" fill="url(#sc-st)" />
          <path d="M37 50L35 55H45L43 50H37Z" fill="#D97706" fillOpacity="0.5" />
          {/* Base */}
          <rect x="26" y="65" width="28" height="6" rx="1.5" fill="url(#sc-g)" />
          <rect x="22" y="71" width="36" height="5" rx="1" fill="#B45309" />
        </svg>
      </div>
    </div>
  )
}
