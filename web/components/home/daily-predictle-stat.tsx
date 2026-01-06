import Link from 'next/link'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { dailyStatsClass } from 'web/components/home/daily-stats'
import { track } from 'web/lib/service/analytics'
import { Col } from '../layout/col'
import { safeLocalStorage } from 'web/lib/util/local'

// Get today's date string in Pacific Time (matches predictle page logic)
function getTodayDateStringPT(): string {
  const now = new Date()
  return now.toLocaleDateString('en-CA', {
    timeZone: 'America/Los_Angeles',
  })
}

export const DailyPredictleStat = (props: { className?: string }) => {
  const { className } = props
  const [gameStatus, setGameStatus] = useState<{
    completed: boolean
    won: boolean
    attempts: number
  } | null>(null)

  useEffect(() => {
    const stored = safeLocalStorage?.getItem('predictle-game-state')
    if (stored) {
      try {
        const state = JSON.parse(stored)
        const todayPT = getTodayDateStringPT()
        const isToday = state.dateString === todayPT
        const attemptCount = state.attempts?.[0]?.feedback?.length ?? 0
        setGameStatus({
          completed: isToday && state.completed,
          won: isToday && state.won,
          attempts: isToday ? attemptCount : 0,
        })
      } catch {
        setGameStatus({ completed: false, won: false, attempts: 0 })
      }
    } else {
      setGameStatus({ completed: false, won: false, attempts: 0 })
    }
  }, [])

  // Don't render until we've checked localStorage (avoid hydration mismatch)
  if (gameStatus === null) {
    return null
  }

  const { completed, won, attempts } = gameStatus

  return (
    <Link
      prefetch={false}
      href="/predictle"
      onClick={() => track('click daily predictle button')}
    >
      <Col
        className={clsx(
          className ?? clsx(dailyStatsClass, 'relative items-center')
        )}
      >
        <div className="whitespace-nowrap">
          {completed ? (won ? `✅ ${attempts}` : '❌') : '🔮'}
        </div>
        <div className="text-ink-600 text-xs">Predictle</div>
      </Col>
    </Link>
  )
}
