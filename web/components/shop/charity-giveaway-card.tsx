import clsx from 'clsx'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { FaGift, FaTrophy } from 'react-icons/fa6'
import { User } from 'common/user'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Button } from '../buttons/button'
import { charities } from 'common/charity'

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
  const { data: propData, isLoading = false, variant = 'full', className, user } = props
  // Use provided data or fetch our own
  const { data: fetchedData } = useAPIGetter('get-charity-giveaway', { userId: user?.id })
  const data = propData ?? fetchedData

  const giveaway = data?.giveaway
  const totalTickets = data?.totalTickets ?? 0
  const winningCharity = data?.winningCharity
  const winner = data?.winner
  const champion = data?.champion
  const topUsers = data?.topUsers
  const yourEntry = data?.yourEntry

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
      <Link href="/charity" className={clsx('block', className)}>
        <div
          className={clsx(
            'group relative overflow-hidden rounded-xl p-1 transition-all duration-200',
            'bg-gradient-to-br from-emerald-400 via-teal-400 to-cyan-500',
            'hover:shadow-lg hover:shadow-teal-200/50 dark:hover:shadow-teal-900/30',
            'hover:-translate-y-1'
          )}
        >
          {/* Inner card content */}
          <div className="rounded-lg bg-white p-4 dark:bg-gray-900">
            {/* Header */}
            <Row className="mb-3 items-center gap-2">
              <FaGift className="h-5 w-5 text-emerald-500" />
              <span className="text-lg font-semibold">Charity Giveaway</span>
              <span className="ml-auto rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                LIVE
              </span>
            </Row>

            {/* Stats row */}
            <Row className="mb-3 gap-2 text-center">
              <Col className="flex-1">
                <div className="text-lg font-bold text-emerald-600 sm:text-xl">
                  {prizeDisplay}
                </div>
                <div className="text-ink-500 text-[10px]">Prize Pool</div>
              </Col>
              <Col className="flex-1">
                <div className="whitespace-nowrap text-lg font-bold text-teal-600 sm:text-xl">
                  {timeRemaining || '...'}
                </div>
                <div className="text-ink-500 text-[10px]">Time Left</div>
              </Col>
              <Col className="flex-1">
                <div className="text-lg font-bold text-cyan-600 sm:text-xl">
                  {Math.floor(totalTickets).toLocaleString()}
                </div>
                <div className="text-ink-500 text-[10px]">Tickets</div>
              </Col>
            </Row>

            {/* Mini leaderboard */}
            {topUsers && topUsers.length > 0 && (
              <MiniLeaderboard topUsers={topUsers} yourEntry={yourEntry} user={user} />
            )}

            {/* CTA */}
            <Button
              color="green"
              size="sm"
              className="w-full group-hover:shadow-md"
            >
              View Giveaway →
            </Button>
          </div>
        </div>
      </Link>
    )
  }

  // Closed but winner not yet drawn — awaiting draw
  if (!hasWinner && isClosed) {
    return (
      <Link href="/charity" className={clsx('block', className)}>
        <div
          className={clsx(
            'group relative overflow-hidden rounded-xl p-1 transition-all duration-200',
            'bg-gradient-to-br from-amber-400 via-yellow-400 to-orange-400',
            'hover:shadow-lg hover:shadow-amber-200/50 dark:hover:shadow-amber-900/30',
            'hover:-translate-y-1'
          )}
        >
          <div className="flex flex-col rounded-lg bg-white p-4 dark:bg-gray-900">
            {/* Header */}
            <Row className="mb-3 items-center gap-2">
              <FaGift className="h-5 w-5 text-amber-500" />
              <span className="text-lg font-semibold">Charity Giveaway</span>
              <span className="ml-auto rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                ENDED
              </span>
            </Row>

            {/* Stats */}
            <Row className="mb-3 gap-2 text-center">
              <Col className="flex-1">
                <div className="text-lg font-bold text-amber-600 sm:text-xl">
                  {prizeDisplay}
                </div>
                <div className="text-ink-500 text-[10px]">Prize Pool</div>
              </Col>
              <Col className="flex-1">
                <div className="text-lg font-bold text-amber-600 sm:text-xl">
                  {Math.floor(totalTickets).toLocaleString()}
                </div>
                <div className="text-ink-500 text-[10px]">Tickets</div>
              </Col>
            </Row>

            {/* Mini leaderboard */}
            {topUsers && topUsers.length > 0 && (
              <MiniLeaderboard topUsers={topUsers} yourEntry={yourEntry} user={user} />
            )}

            <p className="text-ink-500 mb-3 text-xs">
              Giveaway has ended. Winner will be drawn soon!
            </p>

            {/* CTA */}
            <Button
              color="amber"
              size="sm"
              className="mt-auto w-full group-hover:shadow-md"
            >
              View Results →
            </Button>
          </div>
        </div>
      </Link>
    )
  }

  // Winner selected - show results with leaderboard
  return (
    <Link href="/charity" className={clsx('block', className)}>
      <div
        className={clsx(
          'group relative overflow-hidden rounded-xl p-1 transition-all duration-200',
          'bg-gradient-to-br from-amber-400 via-yellow-400 to-orange-400',
          'hover:shadow-lg hover:shadow-amber-200/50 dark:hover:shadow-amber-900/30',
          'hover:-translate-y-1'
        )}
      >
        {/* Inner card content */}
        <div className="flex flex-col rounded-lg bg-white p-4 dark:bg-gray-900">
          {/* Header */}
          <Row className="mb-3 items-center gap-2">
            <FaGift className="h-5 w-5 text-amber-500" />
            <span className="text-lg font-semibold">Charity Giveaway</span>
            <span className="ml-auto rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
              ENDED
            </span>
          </Row>

          {/* Winner info */}
          <Col className="mb-3">
            <div className="font-semibold text-amber-600">
              {winningCharityInfo?.name ?? winningCharity}
            </div>
            <Row className="items-baseline gap-2">
              <div className="text-2xl font-bold text-amber-600">
                {prizeDisplay}
              </div>
              <div className="text-ink-500 text-xs">donated</div>
            </Row>
            {winner && (
              <div className="text-ink-500 mt-1 text-sm">
                Winning ticket by @{winner.username}
              </div>
            )}
          </Col>

          {/* Mini leaderboard */}
          {topUsers && topUsers.length > 0 && (
            <MiniLeaderboard topUsers={topUsers} yourEntry={yourEntry} user={user} />
          )}

          {/* CTA */}
          <Button
            color="amber"
            size="sm"
            className="mt-auto w-full group-hover:shadow-md"
          >
            See Results & Next Giveaway →
          </Button>
        </div>
      </div>
    </Link>
  )
}

function MiniLeaderboard(props: {
  topUsers: NonNullable<CharityGiveawayData['topUsers']>
  yourEntry?: CharityGiveawayData['yourEntry']
  user?: User | null
}) {
  const { topUsers, yourEntry, user } = props

  // Always show top 3, then show the user's row below if they're not already visible
  const visibleUsers = topUsers.slice(0, 3)
  const userAlreadyShown = user && visibleUsers.some((u) => u.id === user.id)
  const showYourRow = user && yourEntry && !userAlreadyShown

  return (
    <Col className="mb-3 gap-0.5 rounded-lg bg-amber-50/80 px-3 py-2 dark:bg-amber-900/20">
      {visibleUsers.map((u) => {
        const isYou = user && u.id === user.id
        return (
          <LeaderboardRow
            key={u.id}
            rank={u.rank}
            name={isYou ? 'You' : u.name}
            tickets={u.totalTickets}
            isLeader={u.rank === 1}
            isYou={!!isYou}
          />
        )
      })}
      {showYourRow && (
        <>
          <div className="text-ink-400 px-1 text-xs leading-tight">···</div>
          <LeaderboardRow
            rank={yourEntry.rank}
            name="You"
            tickets={yourEntry.totalTickets}
            isLeader={false}
            isYou
          />
        </>
      )}
    </Col>
  )
}

function LeaderboardRow(props: {
  rank: number
  name: string
  tickets: number
  isLeader: boolean
  isYou: boolean
}) {
  const { rank, name, tickets, isLeader, isYou } = props
  return (
    <Row className="items-center gap-1.5 text-sm">
      {isLeader ? (
        <FaTrophy
          className="h-3 w-3 shrink-0 text-amber-500"
          style={{ filter: 'drop-shadow(0 0 2px rgba(245, 158, 11, 0.4))' }}
        />
      ) : (
        <span className="text-ink-400 w-3 shrink-0 text-center text-xs">
          {rank}
        </span>
      )}
      <span
        className={clsx(
          'min-w-0 truncate',
          isYou
            ? 'font-bold text-teal-700 dark:text-teal-400'
            : isLeader
            ? 'font-semibold text-amber-700 dark:text-amber-400'
            : 'text-ink-600'
        )}
      >
        {name}
      </span>
      <span className="text-ink-400 ml-auto shrink-0 text-xs">
        {Math.floor(tickets).toLocaleString()}
      </span>
    </Row>
  )
}
