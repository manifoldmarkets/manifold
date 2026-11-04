import clsx from 'clsx'
import Link from 'next/link'

import { formatOdds } from 'web/components/usa-map/election-display'
import { DEM_COLOR, REP_COLOR } from 'web/components/usa-map/state-election-map'
import type { Swing2026 } from 'web/lib/politics/swings-2026'
import { track } from 'web/lib/service/analytics'

// 2026's biggest swings, from a week out to the result: the two chamber
// races first, then the races whose winner moved furthest. Each card is a
// sparkline of the winner's chance through the final week.
export function Swings2026(props: { swings: Swing2026[] }) {
  const control = props.swings.filter((s) => s.office === 'control')
  const races = props.swings.filter((s) => s.office !== 'control')
  return (
    <div className="flex flex-col gap-3">
      {control.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {control.map((s) => (
            <SwingCard key={s.contractId} swing={s} big />
          ))}
        </div>
      )}
      <div className="flex snap-x gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4">
        {races.map((s) => (
          <SwingCard key={s.contractId} swing={s} />
        ))}
      </div>
    </div>
  )
}

const sideColor = (s: Swing2026) =>
  s.side === 'D' ? DEM_COLOR : s.side === 'R' ? REP_COLOR : '#6b7280'

// The card's result badge: "D won", "Passed", or the side and its odds while
// the race is still open.
function resultBadge(s: Swing2026) {
  const short =
    s.side === 'D'
      ? 'D'
      : s.side === 'R'
      ? 'R'
      : s.side === 'YES'
      ? 'Yes'
      : 'No'
  if (!s.resolved) return `${short} ${formatOdds(s.to)}`
  if (s.side === 'YES') return s.to >= 0.5 ? 'Passed' : 'Failed'
  if (s.side === 'NO') return s.to >= 0.5 ? 'Failed' : 'Passed'
  return s.to >= 0.5 ? `${short} won` : `${short} lost`
}

function SwingCard(props: { swing: Swing2026; big?: boolean }) {
  const { swing: s, big } = props
  const pts = Math.round((s.to - s.from) * 100)
  return (
    <Link
      href={`/${s.creatorUsername}/${s.slug}`}
      onClick={() => track('click election 2026 swing', { race: s.label })}
      className={clsx(
        'bg-canvas-0 border-ink-200 hover:border-primary-300 flex shrink-0 snap-start flex-col gap-2 rounded-xl border p-3 transition-colors',
        big ? 'sm:p-4' : 'w-48 sm:w-auto'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-ink-1000 line-clamp-2 text-sm font-semibold leading-snug">
          {s.label}
        </span>
        <span className="bg-canvas-50 text-ink-700 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold">
          {resultBadge(s)}
        </span>
      </div>
      <Sparkline swing={s} height={big ? 56 : 40} />
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-ink-600 text-xs tabular-nums">
          {s.sideLabel} {formatOdds(s.from)} →{' '}
          {s.resolved ? (s.to >= 0.5 ? 'won' : 'lost') : formatOdds(s.to)}
        </span>
        <span className="text-ink-1000 shrink-0 text-base font-semibold tabular-nums">
          {pts > 0 ? '+' : pts < 0 ? '−' : ''}
          {Math.abs(pts)}
          <span className="text-ink-600 ml-0.5 text-xs font-normal">pts</span>
        </span>
      </div>
    </Link>
  )
}

function Sparkline(props: { swing: Swing2026; height: number }) {
  const { swing, height } = props
  const pts = swing.points
  if (pts.length < 2) return <div style={{ height }} />
  const t0 = pts[0][0]
  const t1 = pts[pts.length - 1][0]
  const W = 200
  const span = Math.max(1, t1 - t0)
  const path = pts
    .map(([t, p], i) => {
      const x = ((t - t0) / span) * W
      const y = (1 - p) * (height - 4) + 2
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const color = sideColor(swing)
  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
      aria-hidden
    >
      <line
        x1={0}
        x2={W}
        y1={height / 2}
        y2={height / 2}
        className="stroke-ink-200"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
