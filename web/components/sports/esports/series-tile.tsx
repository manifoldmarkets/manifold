import clsx from 'clsx'

import { EsportsMarketOverlay } from 'common/api/schema'
import { EsportsSeriesFacts } from 'common/esports/types'
import { formatFeedPrice } from 'common/sports-price'
import { Row } from 'web/components/layout/row'
import { canBetOnSeries } from 'web/hooks/use-esports-tournaments'
import { TeamPlate } from './esports-marks'

const TILE =
  'bg-canvas-0 relative flex h-[54px] flex-col justify-center gap-1 rounded-lg border px-1.5'

/**
 * A series at board size: two teams, each with its score, or its price while
 * the series can still be bet on. One still to finish links to its full row.
 * With no series, the slot nobody has reached yet.
 */
export function SeriesTile(props: {
  series: EsportsSeriesFacts | null
  market?: EsportsMarketOverlay
  className?: string
}) {
  const { series, market, className } = props
  if (!series)
    return (
      <div
        className={clsx(
          TILE,
          'border-ink-300 text-ink-400 items-center border-dashed text-[10px] font-semibold',
          className
        )}
      >
        To be decided
      </div>
    )

  const open = series.status !== 'final'
  const priced = open && canBetOnSeries(market)
  const lines = ([series.team1, series.team2] as const).map((team, i) => {
    const won = series.winnerId != null && team?.id === series.winnerId
    const score = i === 0 ? series.score?.team1 : series.score?.team2
    const answer = team && market?.answers.find((a) => a.teamId === team.id)
    return (
      <Row key={i} className="min-w-0 items-center gap-1.5">
        <TeamPlate
          team={team}
          size="xs"
          muted={series.winnerId != null && !won}
        />
        <span
          className={clsx(
            'min-w-0 flex-1 truncate text-[11px]',
            won ? 'text-ink-1000 font-bold' : 'text-ink-700'
          )}
        >
          {team?.name ?? 'To be decided'}
        </span>
        <span
          className={clsx(
            'shrink-0 text-[11px] tabular-nums',
            series.status === 'in_progress'
              ? 'text-scarlet-600 font-bold'
              : won
              ? 'text-ink-1000 font-bold'
              : 'text-ink-600'
          )}
        >
          {series.status !== 'scheduled' && score != null
            ? score
            : priced && answer
            ? formatFeedPrice(answer.prob)
            : won
            ? '✓'
            : ''}
        </span>
      </Row>
    )
  })
  return open ? (
    <a
      href={`#series-${series.id}`}
      data-series={series.id}
      className={clsx(TILE, 'border-ink-200 hover:border-ink-400', className)}
    >
      {lines}
    </a>
  ) : (
    <div
      data-series={series.id}
      className={clsx(TILE, 'border-ink-200', className)}
    >
      {lines}
    </div>
  )
}
