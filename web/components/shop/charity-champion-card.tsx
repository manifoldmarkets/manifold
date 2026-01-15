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
      const result = await api('claim-charity-champion', { enabled: newEnabled })
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
        'relative flex flex-col gap-3 p-4 transition-all duration-200',
        'bg-gradient-to-br from-amber-50/50 via-yellow-50/30 to-orange-50/50 dark:from-amber-900/20 dark:via-yellow-900/15 dark:to-orange-900/20',
        'hover:ring-2 hover:ring-amber-500 hover:shadow-xl hover:shadow-amber-200/50 hover:-translate-y-1 dark:hover:shadow-amber-900/30',
        className
      )}
    >
      {/* Header */}
      <Row className="items-center gap-2">
        <FaTrophy className="h-5 w-5 shrink-0 text-amber-500" />
        <span className="text-lg font-semibold text-amber-700 dark:text-amber-400">
          Charity Champion Trophy
        </span>
      </Row>

      {/* Description */}
      <p className="text-ink-600 text-sm">
        Reserved for the #1 ticket buyer in the charity raffle.
      </p>

      {/* Current trophy holder section */}
      <div className="rounded-lg bg-white/60 p-3 dark:bg-gray-800/60">
        <div className="text-ink-500 mb-2 text-xs font-medium uppercase tracking-wide">
          Trophy Holder
        </div>
        {trophyHolder ? (
          <Link href={`/${trophyHolder.username}`} className="block">
            <Row className="items-center gap-3 transition-opacity hover:opacity-80">
              <Avatar
                avatarUrl={trophyHolder.avatarUrl}
                username={trophyHolder.username}
                size="sm"
                noLink
                className="ring-2 ring-amber-400"
              />
              <Col className="min-w-0 flex-1">
                <Row className="items-center gap-1">
                  <span className="truncate font-semibold text-amber-700 dark:text-amber-400">
                    {trophyHolder.name}
                  </span>
                  <FaTrophy
                    className="h-3.5 w-3.5 shrink-0 text-amber-500"
                    style={{ filter: 'drop-shadow(0 0 2px rgba(245, 158, 11, 0.4))' }}
                  />
                </Row>
                <div className="text-ink-500 text-sm">@{trophyHolder.username}</div>
              </Col>
              <Col className="shrink-0 text-right">
                <div className="text-lg font-bold text-amber-600">
                  {trophyHolder.totalTickets.toLocaleString()}
                </div>
                <div className="text-ink-500 text-xs">tickets</div>
              </Col>
            </Row>
            <div className="text-ink-400 mt-2 text-xs">
              Held since <RelativeTimestamp time={trophyHolder.claimedTime} />
            </div>
          </Link>
        ) : (
          <Row className="items-center gap-3">
            {/* Empty avatar placeholder */}
            <div className="h-8 w-8 shrink-0 rounded-full bg-gray-200 ring-2 ring-gray-300 dark:bg-gray-700 dark:ring-gray-600" />
            <Row className="items-center gap-1">
              <span className="text-ink-400 italic">Unclaimed</span>
              <FaTrophy
                className="h-3.5 w-3.5 shrink-0 text-amber-500/50"
                style={{ filter: 'drop-shadow(0 0 2px rgba(245, 158, 11, 0.2))' }}
              />
            </Row>
          </Row>
        )}
      </div>

      {/* Footer */}
      <Col className="mt-auto pt-1">
        {isCurrentUserChampion ? (
          hasTrophy ? (
            // Has trophy - show toggle
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
          ) : (
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
          )
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
