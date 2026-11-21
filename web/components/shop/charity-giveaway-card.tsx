import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { FaHeart, FaGift } from 'react-icons/fa6'
import { User } from 'common/user'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { charities } from 'common/charity'
import {
  ENDED_PILL,
  GiveawayPromoCard,
  promoStatSizeClass,
} from './giveaway-promo-card'

// Shared entry formatter: always whole-number entries for a cleaner display.
// Sub-1 counts still round to 0 (they shouldn't appear in prod since partial
// entries are contract-level, not user-facing in these summary tiles).
export function formatEntries(entries: number): string {
  return Math.round(entries).toLocaleString()
}

// Export the data type for use by other components
export type CharityGiveawayData = {
  giveaway?: {
    giveawayNum: number
    name: string
    prizeAmountUsd: number
    closeTime: number
    winningTicketId: string | null
    createdTime: number
  }
  charityStats: {
    charityId: string
    totalTickets: number
    totalManaSpent: number
  }[]
  totalTickets: number
  winningCharity?: string
  winner?: {
    id: string
    username: string
    name: string
    avatarUrl: string
  }
  champion?: {
    id: string
    username: string
    name: string
    avatarUrl: string
    totalTickets: number
  }
  topUsers?: {
    id: string
    username: string
    name: string
    avatarUrl: string
    totalTickets: number
    rank: number
  }[]
  yourEntry?: {
    rank: number
    totalTickets: number
  }
  trophyHolder?: {
    id: string
    username: string
    name: string
    avatarUrl: string
    totalTickets: number
    claimedTime: number
  }
  previousTrophyHolder?: {
    id: string
    username: string
    name: string
    avatarUrl: string
  }
  nonceHash?: string
  nonce?: string
}

export function CharityGiveawayCard(props: {
  data?: CharityGiveawayData
  isLoading?: boolean
  variant?: 'full' | 'compact'
  className?: string
  user?: User | null
}) {
  const {
    data: propData,
    isLoading = false,
    variant = 'full',
    className,
    user,
  } = props
  // Use provided data or fetch our own
  const { data: fetchedData } = useAPIGetter('get-charity-giveaway', {
    userId: user?.id,
  })
  const data = propData ?? fetchedData

  const giveaway = data?.giveaway
  const totalTickets = data?.totalTickets ?? 0
  const winningCharity = data?.winningCharity
  const winner = data?.winner
  const champion = data?.champion

  // Time remaining countdown
  const [timeRemaining, setTimeRemaining] = useState<string>('')
  useEffect(() => {
    if (!giveaway) return
    const updateTime = () => {
      const now = Date.now()
      const diff = giveaway.closeTime - now
      if (diff <= 0) {
        setTimeRemaining('Ended')
        return
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor(
        (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      )
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      if (days > 0) {
        setTimeRemaining(`${days}d ${hours}h`)
      } else if (hours > 0) {
        setTimeRemaining(`${hours}h ${minutes}m`)
      } else {
        setTimeRemaining(`${minutes}m`)
      }
    }
    updateTime()
    const interval = setInterval(updateTime, 60000)
    return () => clearInterval(interval)
  }, [giveaway?.closeTime])

  // Show loading skeleton
  if (isLoading) {
    return (
      <div
        className={clsx(
          'overflow-hidden rounded-xl p-1',
          'bg-gradient-to-br from-gray-300 via-gray-200 to-gray-300 dark:from-gray-700 dark:via-gray-600 dark:to-gray-700',
          className
        )}
      >
        <div className="animate-pulse rounded-lg bg-white p-4 dark:bg-gray-900">
          <Row className="mb-3 items-center gap-2">
            <div className="h-5 w-5 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-5 w-32 rounded bg-gray-200 dark:bg-gray-700" />
          </Row>
          <Row className="mb-3 gap-4">
            <div className="h-12 flex-1 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-12 flex-1 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-12 flex-1 rounded bg-gray-200 dark:bg-gray-700" />
          </Row>
          <div className="mb-3 h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-8 w-full rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    )
  }

  // Don't render if no giveaway data
  if (!giveaway) return null

  const hasWinner = !!giveaway.winningTicketId
  const isClosed = giveaway.closeTime <= Date.now()
  const prizeDisplay = `$${giveaway.prizeAmountUsd.toLocaleString()}`

  // Get winning charity info if there's a winner
  const winningCharityInfo = winningCharity
    ? charities.find((c) => c.id === winningCharity)
    : null

  // Active giveaway card (still open for tickets)
  if (!hasWinner && !isClosed) {
    return (
      <GiveawayPromoCard
        href="/charity"
        className={className}
        gradientClassName="from-emerald-400 via-teal-400 to-cyan-500"
        hoverShadowClassName="group-hover:shadow-teal-200/50 dark:group-hover:shadow-teal-900/30"
        icon={<FaHeart className="h-5 w-5 text-emerald-500" />}
        title="Charity Giveaway"
        pill={{
          text: 'LIVE',
          className:
            'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
        }}
        stats={[
          {
            value: prizeDisplay,
            label: 'Prize Pool',
            valueClassName: clsx(
              'font-bold text-emerald-600',
              promoStatSizeClass(totalTickets, true)
            ),
          },
          {
            value: timeRemaining || '...',
            label: 'Time Left',
            valueClassName: clsx(
              'font-bold text-teal-600',
              promoStatSizeClass(totalTickets, true)
            ),
            extraClassName: 'whitespace-nowrap',
          },
          {
            value: formatEntries(totalTickets),
            label: 'Entries',
            valueClassName: clsx(
              'font-bold text-cyan-600',
              promoStatSizeClass(totalTickets, true)
            ),
          },
        ]}
        ctaText="View Giveaway →"
        ctaColor="green"
      />
    )
  }

  // Closed but winner not yet drawn — awaiting draw
  if (!hasWinner && isClosed) {
    return (
      <GiveawayPromoCard
        href="/charity"
        className={className}
        gradientClassName="from-emerald-400 via-teal-400 to-cyan-500"
        hoverShadowClassName="group-hover:shadow-teal-200/50 dark:group-hover:shadow-teal-900/30"
        icon={<FaGift className="h-5 w-5 text-emerald-500" />}
        title="Charity Giveaway"
        pill={ENDED_PILL}
        stats={[
          {
            value: prizeDisplay,
            label: 'Prize Pool',
            valueClassName: clsx(
              'font-bold text-emerald-600',
              promoStatSizeClass(totalTickets, true)
            ),
          },
          {
            value: formatEntries(totalTickets),
            label: 'Entries',
            valueClassName: clsx(
              'font-bold text-cyan-600',
              promoStatSizeClass(totalTickets, true)
            ),
          },
        ]}
        message="Giveaway has ended. Winner will be drawn soon!"
        ctaText="View Results →"
        ctaColor="green"
      />
    )
  }

  // Winner selected — uses the same header / 2-stat / message / CTA layout
  // as the prize-drawing ended card so the two cards align side-by-side. The
  // charity and winner are moved into the message line.
  const charityName = winningCharityInfo?.name ?? winningCharity
  return (
    <GiveawayPromoCard
      href="/charity"
      className={className}
      gradientClassName="from-emerald-400 via-teal-400 to-cyan-500"
      hoverShadowClassName="group-hover:shadow-teal-200/50 dark:group-hover:shadow-teal-900/30"
      icon={<FaHeart className="h-5 w-5 text-emerald-500" />}
      title="Charity Giveaway"
      pill={ENDED_PILL}
      stats={[
        {
          value: prizeDisplay,
          label: 'Donated',
          valueClassName: clsx(
            'font-bold text-emerald-600',
            promoStatSizeClass(totalTickets, true)
          ),
        },
        {
          value: formatEntries(totalTickets),
          label: 'Entries',
          valueClassName: clsx(
            'font-bold text-cyan-600',
            promoStatSizeClass(totalTickets, true)
          ),
        },
      ]}
      message={
        <>
          To{' '}
          <span className="font-semibold text-emerald-600">{charityName}</span>
          {winner && <> · Won by @{winner.username}</>}
        </>
      }
      ctaText="See Results & Next Giveaway →"
      ctaColor="green"
    />
  )
}
