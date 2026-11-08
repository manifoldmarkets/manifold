import Link from 'next/link'

import { formatOdds } from 'web/components/usa-map/election-display'
import { DEM_COLOR, REP_COLOR } from 'web/components/usa-map/state-election-map'
import type { Swing2026 } from 'web/lib/politics/swings-2026'
import { track } from 'web/lib/service/analytics'

// 2026's biggest swings, from a week out to the result: the two chamber
// races first, then the races whose winner moved furthest. One line each,
// with a sparkline of the winner's chance through the final week; two
// columns from tablet width.
export function Swings2026(props: { swings: Swing2026[] }) {
  const ordered = [
    ...props.swings.filter((s) => s.office === 'control'),
    ...props.swings.filter((s) => s.office !== 'control'),
  ]
  return (
    <ul className="grid gap-x-8 md:grid-cols-2">
      {ordered.map((s) => (
        <li
          key={s.contractId}
          className="border-ink-200 border-b last:border-b-0"
        >
          <SwingRow swing={s} />
        </li>
      ))}
    </ul>
  )
}

const sideColor = (s: Swing2026) =>
  s.side === 'D' ? DEM_COLOR : s.side === 'R' ? REP_COLOR : '#6b7280'

function SwingRow(props: { swing: Swing2026 }) {
  const { swing: s } = props
  const pts = Math.round((s.to - s.from) * 100)
  return (
    <Link
      href={`/${s.creatorUsername}/${s.slug}`}
      onClick={() => track('click election 2026 swing', { race: s.label })}
      className="hover:bg-canvas-50 group -mx-2 grid grid-cols-[1fr_5rem_3.25rem] items-center gap-3 rounded-md px-2 py-2 sm:grid-cols-[1fr_7rem_3.25rem]"
    >
      <span className="flex min-w-0 flex-col">
        <span className="text-ink-1000 truncate text-sm font-medium group-hover:underline">
          {s.label}
        </span>
        <span className="text-ink-600 truncate text-xs tabular-nums">
          {s.sideLabel} {formatOdds(s.from)} →{' '}
          {s.resolved ? (s.to >= 0.5 ? 'won' : 'lost') : formatOdds(s.to)}
        </span>
      </span>
      <Sparkline swing={s} height={28} />
      <span className="text-ink-1000 text-right text-sm font-semibold tabular-nums">
        {pts > 0 ? '+' : pts < 0 ? '−' : ''}
        {Math.abs(pts)}
        <span className="text-ink-600 ml-0.5 text-xs font-normal">pts</span>
      </span>
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
