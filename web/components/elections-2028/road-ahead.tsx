import clsx from 'clsx'
import Link from 'next/link'

import { formatOdds } from 'web/components/usa-map/election-display'
import { upcomingTimeline } from 'web/lib/politics/elections-2028-config'
import { placeName } from 'web/lib/politics/official-markets'
import {
  EARLY_STATES,
  PrimaryCell,
  PrimaryRow,
} from 'web/lib/politics/primaries'

const DAY = 24 * 60 * 60 * 1000

// The calendar ahead as a timeline. Fixed dates count down; dates the
// parties haven't set show as a season. Entries link to their section, and
// while the early contests are next, their leaders show underneath. `now`
// comes from the server render so the days agree on hydration.
export function RoadAhead(props: { now: number; primaries?: PrimaryRow[] }) {
  const { now, primaries = [] } = props
  const upcoming = upcomingTimeline(now)
  const next = upcoming[0]
  const early =
    next?.key === 'early'
      ? EARLY_STATES.map((st) =>
          primaries.find((r) => r.o === 'P' && r.st === st)
        ).filter((r): r is PrimaryRow => !!r && !!(r.D || r.R))
      : []
  return (
    <div className="bg-canvas-0 border-ink-200 flex flex-col gap-2 rounded-xl border px-3 py-3 sm:px-4">
      <div className="flex snap-x gap-0 overflow-x-auto pb-1">
        {upcoming.map((d, i) => {
          const isNext = d.key === next?.key
          const started = d.time === undefined && d.sortAt <= now
          const when = d.time
            ? new Date(d.time).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                timeZone: 'UTC',
              })
            : d.season
          const days = d.time ? Math.ceil((d.time - now) / DAY) : undefined
          const body = (
            <>
              <div className="mb-2 flex items-center">
                <span
                  className={clsx(
                    'h-2.5 w-2.5 shrink-0 rounded-full',
                    isNext
                      ? 'bg-primary-600 ring-primary-200 ring-4'
                      : 'bg-ink-400'
                  )}
                />
                {i < upcoming.length - 1 && (
                  <span className="bg-ink-200 ml-1 h-px flex-1" />
                )}
              </div>
              <span
                className={clsx(
                  'text-ink-1000 text-sm font-semibold',
                  d.href && 'group-hover:underline'
                )}
              >
                {d.label}
              </span>
              <span className="text-ink-600 text-xs">
                {when} · {d.detail}
              </span>
              <span
                className={clsx(
                  'mt-1 text-xs font-semibold tabular-nums',
                  isNext ? 'text-primary-700' : 'text-ink-500'
                )}
              >
                {days !== undefined
                  ? `${days.toLocaleString('en-US')} ${
                      days === 1 ? 'day' : 'days'
                    }`
                  : started
                  ? 'Under way'
                  : 'Date to be set'}
              </span>
            </>
          )
          return d.href ? (
            <Link
              key={d.key}
              href={d.href}
              className="group relative flex min-w-[9.5rem] flex-1 snap-start flex-col pr-3"
            >
              {body}
            </Link>
          ) : (
            <div
              key={d.key}
              className="relative flex min-w-[9.5rem] flex-1 snap-start flex-col pr-3"
            >
              {body}
            </div>
          )
        })}
      </div>
      {early.length > 0 && (
        <div className="border-ink-200 flex flex-wrap gap-x-4 gap-y-1 border-t pt-2 text-xs">
          <span className="text-ink-600 font-medium">
            Leading the early states:
          </span>
          {early.map((r) => (
            <span key={r.k} className="text-ink-800 inline-flex gap-1.5">
              <span className="font-semibold">{placeName(r.st)}</span>
              {r.D && <Leader party="D" cell={r.D} />}
              {r.R && <Leader party="R" cell={r.R} />}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Leader(props: { party: 'D' | 'R'; cell: PrimaryCell }) {
  const { party, cell } = props
  if (!cell.l) return null
  return (
    <Link
      href={`/${cell.u ?? 'ManifoldPolitics'}/${cell.s}`}
      className="hover:underline"
    >
      {party}: {cell.l} {cell.p !== undefined ? formatOdds(cell.p) : ''}
    </Link>
  )
}
