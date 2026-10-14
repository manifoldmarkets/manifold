import clsx from 'clsx'
import {
  SearchIcon,
  HeartIcon,
  ViewGridIcon,
  ViewListIcon,
  XIcon,
} from '@heroicons/react/solid'
import dayjs from 'dayjs'
import { ReactNode, useState } from 'react'
import { ScheduleGame } from 'common/sports-schedule'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { GameRow, GameRowSkeleton } from 'web/components/sports/game-row'
import { LoadMoreUntilNotVisible } from 'web/components/widgets/visibility-observer'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { firebaseLogin } from 'web/lib/firebase/users'
import { useGameLikes } from './use-game-likes'
import {
  compareGameStartTime,
  compareGameVolume,
  selectFeaturedGame,
} from './game-feed-utils'

type DaySection<T> = { key: string; label: string; items: T[] }

function dayLabel(ms: number, now = Date.now()): string {
  const d = dayjs(ms)
  const today = dayjs(now)
  if (d.isSame(today, 'day')) return 'Today'
  if (d.isSame(today.add(1, 'day'), 'day')) return 'Tomorrow'
  return d.format('dddd')
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
 * A filterable board of live and upcoming games, grouped by local date.
 * Likes use the account's existing market reactions. Search covers loaded games; filtered
 * views expose pagination explicitly so an empty result is not a dead end.
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
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'live' | 'liked'>('all')
  const [date, setDate] = useState('all')
  const [sort, setSort] = useState('time')
  const [view, setView] = usePersistentLocalState<'cards' | 'compact'>(
    'cards',
    'sports-game-view'
  )
  const active = games.filter(
    (game) => game.status === 'upcoming' || game.status === 'live'
  )
  const likes = useGameLikes(active.map((game) => game.id))
  const normalized = query.trim().toLowerCase()
  const hasFilters = filter !== 'all' || date !== 'all' || !!normalized
  const featured =
    view === 'cards' && !hasFilters ? selectFeaturedGame(active) : undefined
  const filtered = active
    .filter(
      (game) =>
        (filter !== 'live' || game.status === 'live') &&
        (filter !== 'liked' || likes.liked.has(game.id)) &&
        (date === 'all' ||
          dayjs(game.startTime).format('YYYY-MM-DD') === date) &&
        (!normalized ||
          `${game.home.name} ${game.home.shortName} ${game.away.name} ${game.away.shortName} ${game.league}`
            .toLowerCase()
            .includes(normalized))
    )
    .sort(sort === 'volume' ? compareGameVolume : compareGameStartTime)
  // Live games always run in kickoff order, including in the Live filter.
  const live = filtered
    .filter((g) => g.status === 'live' && g.id !== featured?.id)
    .sort(compareGameStartTime)
  const upcoming = filtered.filter(
    (g) => g.status === 'upcoming' && g.id !== featured?.id
  )
  const days = groupByDay(upcoming, (g) => g.startTime).sort((a, b) =>
    a.key.localeCompare(b.key)
  )
  const allDays = groupByDay(active, (game) => game.startTime).sort((a, b) =>
    a.key.localeCompare(b.key)
  )
  const reset = () => {
    setQuery('')
    setDate('all')
    setFilter('all')
  }
  const renderGames = (items: ScheduleGame[]) => (
    <div
      className={clsx(
        'grid items-start gap-3',
        view === 'cards' && items.length > 1 && 'sm:grid-cols-2'
      )}
    >
      {items.map((game) => (
        <GameRow
          key={game.id}
          game={game}
          variant={view === 'compact' ? 'compact' : 'card'}
          showLeague={showLeague}
          liked={likes.liked.has(game.id)}
          likeDisabled={likes.disabled(game.id)}
          onToggleLike={() => void likes.toggle(game.id)}
        />
      ))}
    </div>
  )

  if (loading && games.length === 0) {
    return (
      <Col className="gap-2">
        <SectionHeader label="Up next" />
        <FeedSkeleton variant={variant} rows={4} />
      </Col>
    )
  }
  if (active.length === 0) return <>{empty}</>

  return (
    <div className="min-w-0">
      <Col className="min-w-0 gap-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="border-ink-200 bg-canvas-0 focus-within:border-primary-400 focus-within:ring-primary-200 flex min-w-[8rem] flex-1 items-center gap-2 rounded-xl border px-3 focus-within:ring-2">
              <SearchIcon className="text-ink-400 h-4 w-4 shrink-0" />
              <input
                aria-label="Search loaded games"
                placeholder="Search games"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="placeholder:text-ink-400 w-full min-w-0 border-0 bg-transparent py-2 text-sm focus:outline-none focus:ring-0"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear game search"
                  className="text-ink-500 flex h-9 w-9 shrink-0 items-center justify-center"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              )}
            </div>
            <label className="text-ink-500 flex items-center gap-2 text-xs">
              <span className="sr-only sm:not-sr-only">Sort</span>
              <select
                aria-label="Sort games"
                className="border-ink-200 bg-canvas-0 text-ink-700 min-h-[40px] w-28 rounded-lg border py-1.5 pl-2 pr-7 text-xs disabled:opacity-50 sm:w-auto"
                value={filter === 'live' ? 'time' : sort}
                disabled={filter === 'live'}
                title={
                  filter === 'live'
                    ? 'Live games are ordered by start time'
                    : undefined
                }
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="time">Start time</option>
                <option value="volume">Most traded per day</option>
              </select>
            </label>
            <div
              className="border-ink-200 flex shrink-0 rounded-lg border p-0.5"
              role="group"
              aria-label="Game board layout"
            >
              {(
                [
                  { value: 'cards', label: 'Card view', Icon: ViewGridIcon },
                  {
                    value: 'compact',
                    label: 'Compact view',
                    Icon: ViewListIcon,
                  },
                ] as const
              ).map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-label={label}
                  title={label}
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                  className={clsx(
                    'flex h-9 w-9 items-center justify-center rounded-md',
                    view === value
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-ink-400 hover:bg-canvas-100'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div
              className="flex shrink-0 items-center gap-2"
              aria-label="Game filters"
            >
              {(
                [
                  { value: 'all', label: 'All games', count: active.length },
                  {
                    value: 'live',
                    label: 'Live',
                    count: active.filter((game) => game.status === 'live')
                      .length,
                  },
                  {
                    value: 'liked',
                    label: 'Liked',
                    count: likes.loading ? undefined : likes.liked.size,
                  },
                ] as const
              ).map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={filter === item.value}
                  onClick={() => {
                    setFilter(item.value)
                    setDate('all')
                  }}
                  className={clsx(
                    'flex min-h-[40px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold sm:px-3 sm:text-sm',
                    filter === item.value
                      ? 'bg-primary-600 text-white'
                      : 'bg-canvas-0 text-ink-600 hover:bg-canvas-100'
                  )}
                >
                  {item.value === 'live' && (
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  )}
                  {item.value === 'liked' && (
                    <HeartIcon className="h-3.5 w-3.5" />
                  )}
                  {item.label}
                  <span className="text-xs opacity-70">{item.count}</span>
                </button>
              ))}
            </div>
            {filter !== 'live' && (
              <div
                className="flex min-w-0 basis-full gap-2 overflow-x-auto pb-1 md:flex-1 md:basis-0"
                aria-label="Game dates"
              >
                <button
                  type="button"
                  aria-pressed={date === 'all'}
                  onClick={() => setDate('all')}
                  className={clsx(
                    'min-h-[44px] shrink-0 rounded-lg border px-3 text-xs font-semibold',
                    date === 'all'
                      ? 'border-primary-300 bg-primary-50 text-primary-700'
                      : 'border-ink-200 text-ink-500'
                  )}
                >
                  All dates
                </button>
                {allDays.map((day) => (
                  <button
                    type="button"
                    key={day.key}
                    aria-pressed={date === day.key}
                    onClick={() => setDate(day.key)}
                    className={clsx(
                      'min-h-[44px] shrink-0 rounded-lg border px-3 text-left text-xs',
                      date === day.key
                        ? 'border-primary-300 bg-primary-50 text-primary-700'
                        : 'border-ink-200 text-ink-500'
                    )}
                  >
                    <span className="block font-semibold">{day.label}</span>
                    <span>{dayjs(day.key).format('MMM D')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {hasFilters && (
            <div
              className="text-ink-500 flex items-center justify-between gap-2 text-xs"
              role="status"
            >
              <span>
                {filtered.length} of {active.length} loaded games
              </span>
              <button
                type="button"
                className="text-primary-700 min-h-[32px] font-semibold"
                onClick={reset}
              >
                Reset filters
              </button>
            </div>
          )}
          {likes.error && (
            <p className="text-ink-500 text-xs" role="alert">
              Couldn't load your likes.
              <button
                type="button"
                className="text-primary-700 ml-2 underline"
                onClick={() => void likes.refresh()}
              >
                Retry
              </button>
            </p>
          )}
        </div>
        {featured && (
          <GameRow
            game={featured}
            variant="featured"
            showLeague={showLeague}
            liked={likes.liked.has(featured.id)}
            likeDisabled={likes.disabled(featured.id)}
            onToggleLike={() => void likes.toggle(featured.id)}
          />
        )}
        {filtered.length === 0 && (
          <div className="border-ink-200 rounded-xl border border-dashed px-5 py-8 text-center">
            <h3 className="text-ink-900 font-semibold">
              {filter === 'liked'
                ? !likes.user && !likes.loading
                  ? 'Sign in to see your liked games'
                  : likes.error
                  ? 'Your likes are unavailable'
                  : likes.loading
                  ? 'Loading your liked games…'
                  : 'No liked games here yet'
                : filter === 'live'
                ? 'No games live right now'
                : 'No matching games'}
            </h3>
            <p className="text-ink-500 mt-1 text-sm">
              {filter === 'liked'
                ? 'Heart a game to add it to your Manifold likes.'
                : 'Try another date, team, or filter.'}
            </p>
            <button
              type="button"
              onClick={
                filter === 'liked' && likes.user === null
                  ? firebaseLogin
                  : reset
              }
              className="text-primary-700 mt-3 min-h-[40px] text-sm font-bold"
            >
              {filter === 'liked' && likes.user === null
                ? 'Sign in'
                : 'Show all games'}
            </button>
          </div>
        )}
        {live.length > 0 && (
          <Col className="gap-2">
            <SectionHeader label="Live now" count={live.length} accent />
            {renderGames(live)}
          </Col>
        )}
        {days.map((day) => (
          <Col key={day.key} className="gap-2">
            <SectionHeader
              label={day.label}
              sublabel={dayjs(day.items[0].startTime).format('MMM D')}
              count={day.items.length}
            />
            {renderGames(day.items)}
          </Col>
        ))}
        {hasMore ? (
          <>
            {hasFilters ? (
              <button
                type="button"
                onClick={() => void loadMore()}
                className="text-primary-700 border-ink-200 rounded-lg border p-3 text-sm font-semibold"
              >
                Load more games to search
              </button>
            ) : (
              <>
                <LoadMoreUntilNotVisible loadMore={loadMore} />
                <FeedSkeleton variant={variant} rows={2} />
              </>
            )}
          </>
        ) : (
          <p className="text-ink-400 px-1 text-center text-xs">
            All available games · Times shown in your local time zone
          </p>
        )}
      </Col>
    </div>
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
    <Row className="flex-wrap items-baseline gap-x-2 gap-y-1 px-1">
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
        <span className="text-ink-500 ml-auto whitespace-nowrap text-xs">
          {count} {count === 1 ? unit : `${unit}s`}
        </span>
      )}
    </Row>
  )
}
