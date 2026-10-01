import clsx from 'clsx'
import dayjs from 'dayjs'
import { useState } from 'react'
import { ChevronDownIcon } from '@heroicons/react/solid'
import { ScheduleGame } from 'common/sports-schedule'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { GameRow, GameRowSkeleton } from 'web/components/sports/game-row'

type DaySection<T> = { key: string; label: string; items: T[] }

export function dayLabel(ms: number, now = Date.now()): string {
  const d = dayjs(ms)
  const today = dayjs(now)
  if (d.isSame(today, 'day')) return 'Today'
  if (d.isSame(today.add(1, 'day'), 'day')) return 'Tomorrow'
  if (d.diff(today.startOf('day'), 'day') < 7) return d.format('dddd')
  return d.format('ddd, MMM D')
}

/** Group items by the local calendar day of `time(item)`, keeping their order. */
export function groupByDay<T>(
  items: readonly T[],
  time: (item: T) => number,
  now = Date.now()
): DaySection<T>[] {
  const map = new Map<string, DaySection<T>>()
  for (const item of items) {
    const ms = time(item)
    const key = dayjs(ms).format('YYYY-MM-DD')
    const section = map.get(key)
    if (section) section.items.push(item)
    else map.set(key, { key, label: dayLabel(ms, now), items: [item] })
  }
  return [...map.values()]
}

/**
 * The "up next" flow: live games first, then upcoming games grouped by day,
 * then a collapsed list of games that just finished. Renders nothing when
 * there are no games, so the page can put the week's markets in its place.
 */
export function ScheduleList(props: {
  games: ScheduleGame[]
  loading: boolean
  showLeague: boolean
  liveOnly?: boolean
}) {
  const { games, loading, showLeague, liveOnly } = props
  const live = games.filter((g) => g.status === 'live')
  const upcoming = liveOnly ? [] : games.filter((g) => g.status === 'upcoming')
  const finished = liveOnly ? [] : games.filter((g) => g.status === 'finished')
  const days = groupByDay(upcoming, (g) => g.startTime)
  const [showFinished, setShowFinished] = useState(false)

  if (loading && games.length === 0) {
    return (
      <Col className="gap-2">
        <SectionHeader label="This week" />
        <GameRowSkeleton />
        <GameRowSkeleton />
        <GameRowSkeleton />
      </Col>
    )
  }

  if (live.length === 0 && upcoming.length === 0) {
    if (liveOnly) {
      return (
        <p className="text-ink-500 px-1 text-sm">
          Nothing is live right now. Games move here at kickoff.
        </p>
      )
    }
    if (finished.length === 0) return null
    return <FinishedSection games={finished} showLeague={showLeague} open />
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
                ? dayjs(day.items[0].startTime).format('ddd, MMM D')
                : undefined
            }
            count={day.items.length}
          />
          {day.items.map((g) => (
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
  /** Noun for the count: "game" (default) or "market". */
  unit?: string
  accent?: boolean
}) {
  const { label, sublabel, count, accent, unit = 'game' } = props
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
          {count} {count === 1 ? unit : `${unit}s`}
        </span>
      )}
    </Row>
  )
}
