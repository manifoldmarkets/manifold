import clsx from 'clsx'
import dayjs from 'dayjs'
import { useState } from 'react'
import { ChevronDownIcon } from '@heroicons/react/solid'
import { ScheduleGame } from 'common/sports-schedule'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { GameRow, GameRowSkeleton } from 'web/components/sports/game-row'

type DaySection = { key: string; label: string; games: ScheduleGame[] }

export function dayLabel(ms: number, now = Date.now()): string {
  const d = dayjs(ms)
  const today = dayjs(now)
  if (d.isSame(today, 'day')) return 'Today'
  if (d.isSame(today.add(1, 'day'), 'day')) return 'Tomorrow'
  if (d.diff(today.startOf('day'), 'day') < 7) return d.format('dddd')
  return d.format('ddd, MMM D')
}

export function groupByDay(
  games: ScheduleGame[],
  now = Date.now()
): DaySection[] {
  const map = new Map<string, DaySection>()
  for (const g of games) {
    const key = dayjs(g.startTime).format('YYYY-MM-DD')
    const section = map.get(key)
    if (section) section.games.push(g)
    else
      map.set(key, {
        key,
        label: dayLabel(g.startTime, now),
        games: [g],
      })
  }
  return [...map.values()]
}

/**
 * The "up next" flow: live games first, then upcoming games grouped by day,
 * then a collapsed list of games that just finished.
 */
export function ScheduleList(props: {
  games: ScheduleGame[]
  loading: boolean
  showLeague: boolean
  emptyState: React.ReactNode
  liveOnly?: boolean
}) {
  const { games, loading, showLeague, emptyState, liveOnly } = props
  const live = games.filter((g) => g.status === 'live')
  const upcoming = liveOnly ? [] : games.filter((g) => g.status === 'upcoming')
  const finished = liveOnly ? [] : games.filter((g) => g.status === 'finished')
  const days = groupByDay(upcoming)
  const [showFinished, setShowFinished] = useState(false)

  if (loading && games.length === 0) {
    return (
      <Col className="gap-2">
        <SectionHeader label="Today" />
        <GameRowSkeleton />
        <GameRowSkeleton />
        <GameRowSkeleton />
      </Col>
    )
  }

  if (live.length === 0 && upcoming.length === 0) {
    return (
      <Col className="gap-4">
        <div>{emptyState}</div>
        {finished.length > 0 && (
          <FinishedSection games={finished} showLeague={showLeague} open />
        )}
      </Col>
    )
  }

  return (
    <Col className="gap-5">
      {live.length > 0 && (
        <Col className="gap-2">
          <SectionHeader label="Live now" count={live.length} accent />
          {live.map((g) => (
            <GameRow key={g.id} game={g} showLeague={showLeague} />
          ))}
        </Col>
      )}
      {days.map((day) => (
        <Col key={day.key} className="gap-2">
          <SectionHeader
            label={day.label}
            sublabel={
              day.label === 'Today' || day.label === 'Tomorrow'
                ? dayjs(day.games[0].startTime).format('ddd, MMM D')
                : undefined
            }
            count={day.games.length}
          />
          {day.games.map((g) => (
            <GameRow key={g.id} game={g} showLeague={showLeague} />
          ))}
        </Col>
      ))}
      {finished.length > 0 && (
        <FinishedSection
          games={finished}
          showLeague={showLeague}
          open={showFinished}
          onToggle={() => setShowFinished((s) => !s)}
        />
      )}
    </Col>
  )
}

function FinishedSection(props: {
  games: ScheduleGame[]
  showLeague: boolean
  open: boolean
  onToggle?: () => void
}) {
  const { games, showLeague, open, onToggle } = props
  return (
    <Col className="gap-2">
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex items-center gap-2 text-left"
        >
          <SectionHeader label="Just finished" count={games.length} />
          <ChevronDownIcon
            className={clsx(
              'text-ink-400 h-4 w-4 transition-transform',
              open && 'rotate-180'
            )}
          />
        </button>
      ) : (
        <SectionHeader label="Just finished" count={games.length} />
      )}
      {open &&
        games.map((g) => (
          <GameRow
            key={g.id}
            game={g}
            showLeague={showLeague}
            className="opacity-80"
          />
        ))}
    </Col>
  )
}

export function SectionHeader(props: {
  label: string
  sublabel?: string
  count?: number
  accent?: boolean
}) {
  const { label, sublabel, count, accent } = props
  return (
    <Row className="items-baseline gap-2 px-1">
      {accent && (
        <span className="h-2 w-2 translate-y-[-1px] animate-pulse rounded-full bg-red-500" />
      )}
      <h2
        className={clsx(
          'text-sm font-semibold',
          accent ? 'text-red-600' : 'text-ink-900'
        )}
      >
        {label}
      </h2>
      {sublabel && <span className="text-ink-500 text-xs">{sublabel}</span>}
      {count !== undefined && (
        <span className="text-ink-400 text-xs">
          {count} {count === 1 ? 'game' : 'games'}
        </span>
      )}
    </Row>
  )
}
