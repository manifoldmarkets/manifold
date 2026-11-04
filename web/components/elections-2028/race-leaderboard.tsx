import clsx from 'clsx'
import Link from 'next/link'

import { contractPath, MultiContract } from 'common/contract'
import { formatOdds } from 'web/components/usa-map/election-display'
import { CandidateAvatar } from './candidate-avatar'
import { ChartSeries } from './race-series'

// The race as a ranked list: the chart's table view and its legend. Each row
// is a face, a name, the live chance, its move this week and a Bet button.
// Hovering a row highlights that candidate's line.
export function RaceLeaderboard(props: {
  contract: MultiContract
  series: ChartSeries[]
  chartedIds: Set<string>
  highlightId?: string
  onHighlight: (id: string | undefined) => void
  onBet: (answerId: string) => void
  maxRows?: number
  answerCount: number
  columns?: 1 | 2
  className?: string
}) {
  const {
    contract,
    series,
    chartedIds,
    highlightId,
    onHighlight,
    onBet,
    maxRows = 8,
    answerCount,
    columns = 1,
    className,
  } = props
  const rows = series.slice(0, maxRows)
  return (
    <div className={clsx('flex flex-col', className)}>
      <ol
        className={clsx(
          'grid grid-cols-1',
          columns === 2 && 'sm:grid-flow-col sm:grid-cols-2 sm:gap-x-8'
        )}
        style={
          columns === 2
            ? {
                gridTemplateRows: `repeat(${Math.ceil(rows.length / 2)}, auto)`,
              }
            : undefined
        }
      >
        {rows.map((s, i) => (
          <li
            key={s.id}
            className={clsx(
              'border-ink-200 flex items-center gap-2.5 border-b py-2 pr-1 transition-colors',
              highlightId === s.id && 'bg-canvas-50'
            )}
            onMouseEnter={() => onHighlight(s.id)}
            onMouseLeave={() => onHighlight(undefined)}
          >
            <span className="text-ink-400 w-4 shrink-0 text-right text-xs tabular-nums">
              {i + 1}
            </span>
            <CandidateAvatar
              candidate={s.candidate}
              size={32}
              ringColor={chartedIds.has(s.id) ? s.color : undefined}
              party={s.party}
            />
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="text-ink-900 truncate text-sm font-medium">
                {s.candidate.name}
              </span>
              <WeekChange change={s.weekChange} />
            </div>
            <span className="text-ink-900 w-12 shrink-0 text-right text-base font-semibold tabular-nums">
              {formatOdds(s.prob)}
            </span>
            <button
              type="button"
              onClick={() => onBet(s.id)}
              className="border-primary-500 text-primary-700 hover:bg-primary-500 shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors hover:text-white"
              aria-label={`Bet on ${s.candidate.name}, ${formatOdds(s.prob)}`}
            >
              Bet
            </button>
          </li>
        ))}
      </ol>
      <Link
        href={contractPath(contract)}
        className="text-primary-700 hover:text-primary-800 mt-2 self-start text-xs font-medium hover:underline"
      >
        All {answerCount} answers →
      </Link>
    </div>
  )
}

// "▲ 3 pts · 7d" in neutral ink: in a race, up is not good or bad.
export function WeekChange(props: { change: number; className?: string }) {
  const pts = Math.round(props.change * 100)
  const steady = !Number.isFinite(pts) || pts === 0
  return (
    <span
      className={clsx('text-ink-600 text-xs', props.className)}
      title="Change over the last 7 days"
    >
      {steady ? (
        'Steady'
      ) : (
        <>
          <span aria-hidden>{pts > 0 ? '▲' : '▼'}</span>
          <span className="sr-only">{pts > 0 ? 'Up' : 'Down'}</span>{' '}
          {Math.abs(pts)} {Math.abs(pts) === 1 ? 'pt' : 'pts'}
        </>
      )}
      <span className="text-ink-400"> · 7d</span>
    </span>
  )
}
