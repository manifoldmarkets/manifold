import clsx from 'clsx'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { FaGift } from 'react-icons/fa6'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Button } from '../buttons/button'
import { charities } from 'common/charity'

export function CharityGiveawayCard(props: {
  variant?: 'full' | 'compact'
  className?: string
}) {
  const { variant = 'full', className } = props
  const { data } = useAPIGetter('get-charity-giveaway', {})

  const giveaway = data?.giveaway
  const totalTickets = data?.totalTickets ?? 0
  const winningCharity = data?.winningCharity
  const winner = data?.winner

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

  // Don't render if no giveaway data
  if (!giveaway) return null

  const hasWinner = !!giveaway.winningTicketId
  const isClosed = giveaway.closeTime <= Date.now()
  const prizeDisplay = `$${giveaway.prizeAmountUsd.toLocaleString()}`

  // Get winning charity info if there's a winner
  const winningCharityInfo = winningCharity
    ? charities.find((c) => c.id === winningCharity)
    : null

  // Active giveaway card
  if (!hasWinner) {
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
              {!isClosed && (
                <span className="ml-auto rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                  LIVE
                </span>
              )}
            </Row>

            {/* Stats row */}
            <Row className="mb-3 gap-4 text-center">
              <Col className="flex-1">
                <div className="text-2xl font-bold text-emerald-600">
                  {prizeDisplay}
                </div>
                <div className="text-ink-500 text-xs">Prize Pool</div>
              </Col>
              <Col className="flex-1">
                <div className="text-2xl font-bold text-teal-600">
                  {timeRemaining || '...'}
                </div>
                <div className="text-ink-500 text-xs">Time Left</div>
              </Col>
              <Col className="flex-1">
                <div className="text-2xl font-bold text-cyan-600">
                  {Math.floor(totalTickets).toLocaleString()}
                </div>
                <div className="text-ink-500 text-xs">Tickets</div>
              </Col>
            </Row>

            {/* Description */}
            <p className="text-ink-600 mb-3 text-sm">
              Support your favorite charity with mana.
            </p>

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

  // Winner selected - show last winner
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
        <div className="rounded-lg bg-white p-4 dark:bg-gray-900">
          {/* Header */}
          <Row className="mb-3 items-center gap-2">
            <FaGift className="h-5 w-5 text-amber-500" />
            <span className="text-lg font-semibold">Charity Giveaway</span>
            <span className="ml-auto rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
              WINNER
            </span>
          </Row>

          {/* Winner info */}
          <Col className="mb-3">
            <div className="text-ink-500 mb-1 text-xs">Last winner:</div>
            <div className="font-semibold text-amber-600">
              {winningCharityInfo?.name ?? winningCharity}
            </div>
            <div className="text-2xl font-bold text-amber-600">
              {prizeDisplay}
            </div>
            {winner && (
              <div className="text-ink-500 mt-1 text-sm">
                Winning ticket by @{winner.username}
              </div>
            )}
          </Col>

          {/* CTA */}
          <Button
            color="amber"
            size="sm"
            className="w-full group-hover:shadow-md"
          >
            See Results & Next Giveaway →
          </Button>
        </div>
      </div>
    </Link>
  )
}
