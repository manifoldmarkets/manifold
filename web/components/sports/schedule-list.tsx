import clsx from 'clsx'
import dayjs from 'dayjs'
import { ReactNode } from 'react'
import { ScheduleGame } from 'common/sports-schedule'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { GameRow, GameRowSkeleton } from 'web/components/sports/game-row'
import { LoadMoreUntilNotVisible } from 'web/components/widgets/visibility-observer'

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
 * The game feed: what's live now, then every upcoming game by kickoff,
 * grouped by day. More games load as the reader nears the bottom.
 *
 * `list` packs each day into one table of compact rows (the all-sports
 * feed); `cards` gives every game its own card with room for the markets on
 * it (a sport's page).
 */
export function GameFeed(props: {
  games: ScheduleGame[]
  loading: boolean
  hasMore: boolean
  loadMore: () => Promise<boolean>
  variant: 'list' | 'cards'
  showLeague: boolean
  /** Shown when there is nothing live or upcoming. */
  empty: ReactNode
}) {
  const { games, loading, hasMore, loadMore, variant, showLeague, empty } =
    props
  const live = games.filter((g) => g.status === 'live')
  const upcoming = games.filter((g) => g.status === 'upcoming')
  const days = groupByDay(upcoming, (g) => g.startTime)

  if (loading && games.length === 0) {
    return (
      <Col className="gap-2">
        <SectionHeader label="Up next" />
        <FeedSkeleton variant={variant} rows={4} />
      </Col>
    )
  }
  if (live.length === 0 && upcoming.length === 0) return <>{empty}</>

  return (
    <Col className="gap-6">
      {live.length > 0 && (
        <Col className="gap-2">
          <SectionHeader label="Live now" count={live.length} accent />
          <GameGroup games={live} variant={variant} showLeague={showLeague} />
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
          <GameGroup
            games={day.items}
            variant={variant}
            showLeague={showLeague}
          />
        </Col>
      ))}
      {hasMore ? (
        <>
          <LoadMoreUntilNotVisible loadMore={loadMore} />
          <FeedSkeleton variant={variant} rows={2} />
        </>
      ) : (
        <p className="text-ink-400 px-1 text-center text-xs">
          That's every game in the next two weeks.
        </p>
      )}
    </Col>
  )
}

function GameGroup(props: {
  games: ScheduleGame[]
  variant: 'list' | 'cards'
  showLeague: boolean
}) {
  const { games, variant, showLeague } = props
  if (variant === 'cards') {
    return (
      <Col className="gap-3">
        {games.map((g) => (
          <GameRow key={g.id} game={g} variant="card" showLeague={showLeague} />
        ))}
      </Col>
    )
  }
  return (
    <Col className="border-ink-200 bg-canvas-0 divide-ink-100 divide-y overflow-hidden rounded-lg border">
      {games.map((g) => (
        <GameRow key={g.id} game={g} variant="list" showLeague={showLeague} />
      ))}
    </Col>
  )
}

function FeedSkeleton(props: { variant: 'list' | 'cards'; rows: number }) {
  const { variant, rows } = props
  const items = Array.from({ length: rows }, (_, i) => (
    <GameRowSkeleton key={i} variant={variant === 'cards' ? 'card' : 'list'} />
  ))
  return variant === 'cards' ? (
    <Col className="gap-3">{items}</Col>
  ) : (
    <Col className="border-ink-200 bg-canvas-0 divide-ink-100 divide-y overflow-hidden rounded-lg border">
      {items}
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
        <span className="text-ink-400 ml-auto text-xs">
          {count} {count === 1 ? unit : `${unit}s`}
        </span>
      )}
    </Row>
  )
}
