import Link from 'next/link'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { dailyStatsClass } from 'web/components/home/daily-stats'
import { track } from 'web/lib/service/analytics'
import { Col } from '../layout/col'
import { safeLocalStorage } from 'web/lib/util/local'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useUser } from 'web/hooks/use-user'

// Get today's date string in Pacific Time (matches predictle page logic)
function getTodayDateStringPT(): string {
  const now = new Date()
  return now.toLocaleDateString('en-CA', {
    timeZone: 'America/Los_Angeles',
  })
}

export const DailyPredictleStat = (props: { className?: string }) => {
  const { className } = props
  const user = useUser()

  const [gameStatus, setGameStatus] = useState<{
    completed: boolean
    won: boolean
    attempts: number
  } | null>(null)

  // Fetch puzzle number for today
  const { data: predictleData, loading: predictleLoading } = useAPIGetter(
    'get-predictle-markets',
    {}
  )
  const puzzleNumber = predictleData?.puzzleNumber

  // Fetch server result for logged-in users (only shows completed games)
  const { data: serverResult, loading: serverLoading } = useAPIGetter(
    'get-predictle-result',
    user && puzzleNumber !== undefined ? { puzzleNumber } : undefined
  )

  useEffect(() => {
    // Wait for puzzle number to load
    if (predictleLoading || puzzleNumber === undefined) return

    // Wait for user auth to finish loading (undefined = still loading)
    if (user === undefined) return

    // For logged-in users, wait for server result
    if (user) {
      if (serverLoading) return // Still loading server result

      // Server result takes priority over localStorage
      if (serverResult?.hasResult && serverResult.result) {
        const attemptCount =
          serverResult.result.gameState?.attempts?.[0]?.feedback?.length ?? 0
        setGameStatus({
          completed: true,
          won: serverResult.result.won,
          attempts: attemptCount,
        })
        return
      }
      // Server responded with no result - check localStorage for in-progress
    }

    // Use localStorage (for non-logged-in users or if no server result)
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
  }, [user, puzzleNumber, predictleLoading, serverResult, serverLoading])

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
          {completed ? (
            won ? (
              `✅ ${attempts}`
            ) : (
              '❌'
            )
          ) : (
            <img
              src="/predictle-logo.png"
              alt="Predictle"
              className="h-6 w-6"
            />
          )}
        </div>
        <div className="text-ink-600 text-xs">Predictle</div>
      </Col>
    </Link>
  )
}
