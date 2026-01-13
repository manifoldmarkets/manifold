import { useState, useEffect, useRef, useMemo } from 'react'
import { charities } from 'common/charity'
import { sortBy } from 'lodash'
import clsx from 'clsx'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'

// Color palette for the wheel segments
export const WHEEL_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f43f5e', // rose
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#a855f7', // purple
  '#d946ef', // fuchsia
]

interface CharityStat {
  charityId: string
  totalTickets: number
}

interface Winner {
  id: string
  username: string
  name: string
  avatarUrl: string
}

interface SpinningWheelProps {
  charityStats: CharityStat[]
  totalTickets: number
  winningCharityId: string
  onComplete: () => void
  autoStart?: boolean
  showLegend?: boolean
  winner?: Winner
}

export function SpinningWheel(props: SpinningWheelProps) {
  const {
    charityStats,
    totalTickets,
    winningCharityId,
    onComplete,
    autoStart = true,
    showLegend = false,
    winner,
  } = props

  const [rotation, setRotation] = useState(0)
  const [isSpinning, setIsSpinning] = useState(false)
  const [hasCompleted, setHasCompleted] = useState(false)
  const wheelRef = useRef<SVGSVGElement>(null)

  // Calculate segment data - sort by tickets descending to match legend order
  const segments = useMemo(() => {
    const sortedStats = sortBy(charityStats, (s) => -s.totalTickets)
    let startAngle = 0
    return sortedStats.map((stat, i) => {
      const charity = charities.find((c) => c.id === stat.charityId)
      const angle = (stat.totalTickets / totalTickets) * 360
      const segment = {
        charityId: stat.charityId,
        label: charity?.name ?? stat.charityId,
        photo: charity?.photo,
        preview: charity?.preview,
        startAngle,
        endAngle: startAngle + angle,
        midAngle: startAngle + angle / 2,
        color: WHEEL_COLORS[i % WHEEL_COLORS.length],
        percentage: (stat.totalTickets / totalTickets) * 100,
      }
      startAngle += angle
      return segment
    })
  }, [charityStats, totalTickets])

  // Find the winning segment
  const winningSegment = segments.find((s) => s.charityId === winningCharityId)

  // Calculate final rotation to land on winning segment
  // The pointer is at the top (12 o'clock), so we need to rotate the wheel
  // so the winning segment's midpoint is at the top
  const calculateFinalRotation = () => {
    if (!winningSegment) return 0
    // The pointer is at 0 degrees (top). We want the winning segment's mid to be there.
    // Since we're rotating clockwise and segments start from the right,
    // we need to calculate how much to rotate.
    // Start with 3-5 full rotations for visual effect
    const fullRotations = 3 + Math.random() * 2
    const baseRotation = fullRotations * 360
    // Calculate where the winning segment's midpoint is
    // We need to rotate so that (90 - midAngle) is at the top
    // which means rotating by (90 - midAngle) degrees
    const targetAngle = 90 - winningSegment.midAngle
    return baseRotation + targetAngle
  }

  // Start spinning
  const startSpin = () => {
    if (isSpinning || hasCompleted) return
    setIsSpinning(true)
    const finalRotation = calculateFinalRotation()
    setRotation(finalRotation)
  }

  // Handle spin completion
  useEffect(() => {
    if (!isSpinning) return

    const timer = setTimeout(() => {
      setIsSpinning(false)
      setHasCompleted(true)
      onComplete()
    }, 5000) // Match the CSS animation duration

    return () => clearTimeout(timer)
  }, [isSpinning, onComplete])

  // Auto-start if enabled
  useEffect(() => {
    if (autoStart && !isSpinning && !hasCompleted) {
      const timer = setTimeout(startSpin, 500)
      return () => clearTimeout(timer)
    }
  }, [autoStart])

  const size = 320
  const cx = size / 2
  const cy = size / 2
  const radius = size / 2 - 10

  // Convert angle to radians
  const toRadians = (angle: number) => (angle * Math.PI) / 180

  // Calculate arc path
  const getArcPath = (startAngle: number, endAngle: number) => {
    const start = {
      x: cx + radius * Math.cos(toRadians(startAngle - 90)),
      y: cy + radius * Math.sin(toRadians(startAngle - 90)),
    }
    const end = {
      x: cx + radius * Math.cos(toRadians(endAngle - 90)),
      y: cy + radius * Math.sin(toRadians(endAngle - 90)),
    }
    const largeArc = endAngle - startAngle > 180 ? 1 : 0

    return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <Row className="flex-wrap items-center justify-center gap-8">
        {/* Wheel Section */}
        <div className="relative">
          <div className="absolute -top-2 left-1/2 z-10 -translate-x-1/2">
            <div className="h-0 w-0 border-l-[12px] border-r-[12px] border-t-[20px] border-l-transparent border-r-transparent border-t-amber-500 drop-shadow-lg" />
          </div>

          {/* Wheel */}
          <svg
            ref={wheelRef}
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className={clsx(
              'drop-shadow-xl transition-transform',
              isSpinning ? 'duration-[5000ms] ease-out' : 'duration-0'
            )}
            style={{
              transform: `rotate(${rotation}deg)`,
            }}
          >
            {/* Outer ring */}
            <circle
              cx={cx}
              cy={cy}
              r={radius + 5}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="3"
              className="dark:stroke-gray-700"
            />

            {/* Segments */}
            {segments.map((segment, index) => {
              const isWinner =
                hasCompleted && segment.charityId === winningCharityId
              return (
                <path
                  key={index}
                  d={getArcPath(segment.startAngle, segment.endAngle)}
                  fill={segment.color}
                  stroke="#fff"
                  strokeWidth="2"
                  className={clsx(
                    'transition-opacity duration-300',
                    hasCompleted && !isWinner && 'opacity-40'
                  )}
                />
              )
            })}

            {/* Center circle */}
            <circle
              cx={cx}
              cy={cy}
              r={30}
              fill="white"
              stroke="#e5e7eb"
              strokeWidth="3"
              className="dark:fill-gray-800 dark:stroke-gray-700"
            />
            <text
              x={cx}
              y={cy}
              fill="currentColor"
              fontSize="20"
              textAnchor="middle"
              dominantBaseline="middle"
              className="text-ink-600"
            >
              🎟️
            </text>
          </svg>
        </div>

        {/* Legend */}
        {showLegend && (
          <Col className="gap-1">
            {segments.slice(0, 8).map((segment, index) => {
              const isWinner =
                hasCompleted && segment.charityId === winningCharityId
              return (
                <Row
                  key={index}
                  className={clsx(
                    'items-center gap-2.5 rounded-lg px-3 py-1.5 transition-all duration-150',
                    isWinner && 'bg-amber-100 dark:bg-amber-900/30'
                  )}
                >
                  <span
                    className={clsx(
                      'flex-shrink-0 rounded-full transition-all duration-150',
                      isWinner ? 'h-3 w-3' : 'h-2.5 w-2.5'
                    )}
                    style={{
                      backgroundColor: segment.color,
                      opacity: hasCompleted && !isWinner ? 0.4 : 1,
                    }}
                  />
                  <span
                    className={clsx(
                      'max-w-[160px] truncate text-sm transition-all duration-150',
                      isWinner
                        ? 'text-ink-900 font-semibold'
                        : hasCompleted
                        ? 'text-ink-400'
                        : 'text-ink-700'
                    )}
                  >
                    {segment.label}
                  </span>
                  <span
                    className={clsx(
                      'ml-auto whitespace-nowrap text-sm tabular-nums transition-all duration-150',
                      isWinner
                        ? 'text-ink-700 font-medium'
                        : hasCompleted
                        ? 'text-ink-300'
                        : 'text-ink-400'
                    )}
                  >
                    {segment.percentage.toFixed(1)}%
                  </span>
                </Row>
              )
            })}
            {segments.length > 8 && (
              <div className="text-ink-400 px-3 py-1 text-xs">
                +{segments.length - 8} more
              </div>
            )}
          </Col>
        )}
      </Row>

      {/* Status text */}
      <div className="text-center">
        {isSpinning && (
          <p className="text-ink-600 animate-pulse text-lg font-medium">
            Spinning...
          </p>
        )}
        {hasCompleted && winningSegment && (
          <Col className="items-center gap-4">
            <div className="space-y-2 text-center">
              <p className="text-ink-900 text-xl font-bold">
                🎉 {winningSegment.label} wins! 🎉
              </p>
              <p className="text-ink-500 text-sm">
                {winningSegment.percentage.toFixed(1)}% of tickets
              </p>
            </div>

            {/* Winning charity details */}
            <div className="mt-2 flex w-full max-w-md items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
              {winningSegment.photo && (
                <img
                  src={winningSegment.photo}
                  alt={winningSegment.label}
                  className="h-16 w-16 flex-shrink-0 rounded-lg object-cover shadow"
                />
              )}
              <Col className="min-w-0 flex-1 gap-1">
                <div className="text-ink-900 font-semibold">
                  {winningSegment.label}
                </div>
                {winningSegment.preview && (
                  <div className="text-ink-600 line-clamp-2 text-sm">
                    {winningSegment.preview}
                  </div>
                )}
              </Col>
            </div>

            {/* Winning ticket purchaser */}
            {winner && (
              <Row className="text-ink-600 items-center gap-2 text-sm">
                <span>Winning ticket purchased by</span>
                <Avatar
                  username={winner.username}
                  avatarUrl={winner.avatarUrl}
                  size="xs"
                />
                <UserLink
                  user={winner}
                  className="text-ink-900 font-medium"
                />
              </Row>
            )}
          </Col>
        )}
      </div>
    </div>
  )
}
