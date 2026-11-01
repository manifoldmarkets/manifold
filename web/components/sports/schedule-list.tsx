import clsx from 'clsx'
import {
  CalendarIcon,
  ChevronDownIcon,
  TicketIcon,
  ViewGridIcon,
  ViewListIcon,
} from '@heroicons/react/solid'
import dayjs from 'dayjs'
import { ReactNode, useEffect, useState } from 'react'
import {
  raceHeart,
  RaceSessionEvent,
  raceSessionEvents,
  RaceWeekend,
} from 'common/race-weekends'
import { ScheduleGame } from 'common/sports-schedule'
import { formatMoney } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { GameRow, GameRowSkeleton } from 'web/components/sports/game-row'
import {
  LikeFor,
  RaceSessionCard,
} from 'web/components/sports/race-session-card'
import { RaceWeekendHero } from 'web/components/sports/race-weekend-hero'
import DropdownMenu from 'web/components/widgets/dropdown-menu'
import { LoadMoreUntilNotVisible } from 'web/components/widgets/visibility-observer'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { firebaseLogin } from 'web/lib/firebase/users'
import { useGameLikes } from './use-game-likes'
import { useGamePositions } from './use-game-positions'
import {
  GameStake,
  getGameStake,
  profitLabel,
  sumGameStakes,
} from './game-positions'
import { compareGameStartTime, selectFeaturedGame } from './game-feed-utils'

type DaySection<T> = { key: string; label: string; items: T[] }

/** A row of the feed: a game, or an F1 session listed like one. */
type FeedItem = ScheduleGame | RaceSessionEvent
const isSession = (item: FeedItem): item is RaceSessionEvent =>
  'session' in item

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
 * A filterable board of live and upcoming games, grouped by local date, under
 * one compact row of controls: All / Live / My bets, a date menu, and the
 * card or list layout. Hearts use the account's existing market reactions.
 * Filters cover loaded games; filtered views expose pagination explicitly so
 * an empty result is not a dead end.
 */
export function GameFeed(props: {
  games: ScheduleGame[]
  loading: boolean
  hasMore: boolean
  loadMore: () => Promise<boolean>
  showLeague: boolean
  /**
   * F1 weekends: each live or upcoming session goes among the games like one
   * (a live one under "Live now", the rest under their day), and can be the
   * featured card.
   */
  raceWeekends?: RaceWeekend[]
  /**
   * Feature what's on next rather than the most traded: F1's sessions never
   * overlap, so its page leads with the next one.
   */
  featureNext?: boolean
  /**
   * The featured F1 weekend in full, with the timing tower and the day's
   * moves. Elsewhere it's compact, about the size of a featured game.
   */
  fullRaceHero?: boolean
  /** Under the featured card while no filter is on: F1's title fight. */
  belowFeatured?: ReactNode
  /** Shown when there is nothing live or upcoming. */
  empty: ReactNode
}) {
  const {
    games,
    loading,
    hasMore,
    loadMore,
    showLeague,
    featureNext,
    fullRaceHero,
    belowFeatured,
    empty,
  } = props
  const [filter, setFilter] = useState<'all' | 'live' | 'mine'>('all')
  const [date, setDate] = useState('all')
  const [featuredId, setFeaturedId] = useState<string>()
  const [view, setView] = usePersistentLocalState<'cards' | 'compact'>(
    'cards',
    'sports-game-view'
  )
  const active = games.filter(
    (game) => game.status === 'upcoming' || game.status === 'live'
  )
  const sessions = raceSessionEvents(props.raceWeekends ?? [])
  // Every market of the weekends, finished sessions too: the featured card's
  // pills reach them.
  const raceMarketIds = (props.raceWeekends ?? []).flatMap((w) =>
    w.sessions.flatMap((s) => s.markets.map((m) => m.id))
  )
  const likes = useGameLikes([
    ...active.map((game) => game.id),
    ...raceMarketIds,
  ])
  const likeFor: LikeFor = (ids, target) => {
    const { liked, change } = raceHeart(ids, target, (id) =>
      likes.liked.has(id)
    )
    return {
      liked,
      disabled: change.some((id) => likes.disabled(id)),
      toggle: () => change.forEach((id) => void likes.toggle(id)),
    }
  }
  const positions = useGamePositions(active.map((game) => game.id))
  // One stake per game, marked to the live prices, shared by the cards, the
  // My bets filter and its totals so they can't disagree.
  const stakes: Record<string, GameStake> = {}
  for (const game of active) {
    const stake = getGameStake(game, positions.byGame[game.id])
    if (stake) stakes[game.id] = stake
  }
  const stakedCount = Object.keys(stakes).length
  const hasFilters = filter !== 'all' || date !== 'all'
  const everything: FeedItem[] = [...active, ...sessions]
  const selectedFeatured = selectFeaturedGame(
    everything,
    featuredId,
    featureNext ? 'start' : 'volume'
  )
  useEffect(() => {
    if (selectedFeatured) setFeaturedId(selectedFeatured.id)
  }, [selectedFeatured?.id])
  const featured =
    view === 'cards' && !hasFilters ? selectedFeatured : undefined
  const filteredGames = active.filter(
    (game) =>
      (filter !== 'live' || game.status === 'live') &&
      (filter !== 'mine' || !!stakes[game.id]) &&
      (date === 'all' || dayjs(game.startTime).format('YYYY-MM-DD') === date)
  )
  // Sessions take the same filters as games, except My bets: positions don't
  // cover them yet.
  const filteredSessions =
    filter === 'mine'
      ? []
      : sessions.filter(
          (s) =>
            (filter !== 'live' || s.status === 'live') &&
            (date === 'all' || dayjs(s.startTime).format('YYYY-MM-DD') === date)
        )
  const filtered: FeedItem[] = [...filteredGames, ...filteredSessions].sort(
    compareGameStartTime
  )
  // A featured session brings its whole weekend: the featured card's pills
  // cover the other sessions, so they aren't listed again below.
  const featuredWeekendId =
    featured && isSession(featured) ? featured.weekend.id : undefined
  const listed = (item: FeedItem) =>
    item.id !== featured?.id &&
    !(isSession(item) && item.weekend.id === featuredWeekendId)
  // Live games always run in kickoff order, including in the Live filter.
  const live = filtered
    .filter((g) => g.status === 'live' && listed(g))
    .sort(compareGameStartTime)
  const upcoming = filtered.filter((g) => g.status === 'upcoming' && listed(g))
  const days = groupByDay(upcoming, (g) => g.startTime).sort((a, b) =>
    a.key.localeCompare(b.key)
  )
  const allDays = groupByDay(everything, (item) => item.startTime).sort(
    (a, b) => a.key.localeCompare(b.key)
  )
  // A section with a session in it counts events, not games.
  const unitFor = (items: FeedItem[]) =>
    items.some(isSession) ? 'event' : 'game'
  // What the My bets filter adds up: the stake on each game it shows.
  const myStakes: GameStake[] =
    filter === 'mine'
      ? filteredGames.flatMap((game) => {
          const stake = stakes[game.id]
          return stake ? [stake] : []
        })
      : []
  const needsSignIn = filter === 'mine' && likes.user === null
  const reset = () => {
    setDate('all')
    setFilter('all')
  }
  const renderItems = (items: FeedItem[]) => (
    <div
      className={clsx(
        'grid items-start gap-3',
        view === 'cards' && items.length > 1 && 'sm:grid-cols-2'
      )}
    >
      {items.map((item) =>
        isSession(item) ? (
          <RaceSessionCard
            key={item.id}
            event={item}
            variant={view === 'compact' ? 'compact' : 'card'}
            showLeague={showLeague}
            likeFor={likeFor}
          />
        ) : (
          <GameRow
            key={item.id}
            game={item}
            variant={view === 'compact' ? 'compact' : 'card'}
            showLeague={showLeague}
            liked={likes.liked.has(item.id)}
            likeDisabled={likes.disabled(item.id)}
            onToggleLike={() => void likes.toggle(item.id)}
            stake={stakes[item.id]}
            onPositionsChange={() => void positions.refreshGame(item.id)}
          />
        )
      )}
    </div>
  )

  if (loading && games.length === 0 && sessions.length === 0) {
    return (
      <Col className="gap-2">
        <SectionHeader label="Up next" />
        <FeedSkeleton view={view} rows={4} />
      </Col>
    )
  }
  if (everything.length === 0) return <>{empty}</>

  return (
    <div className="min-w-0">
      <Col className="min-w-0 gap-5">
        <div className="space-y-2">
          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <div
              className="flex shrink-0 items-center gap-0.5 sm:gap-1"
              role="group"
              aria-label="Game filters"
            >
              {(
                [
                  {
                    value: 'all',
                    label: 'All',
                    count: everything.length,
                  },
                  {
                    value: 'live',
                    label: 'Live',
                    count: everything.filter((item) => item.status === 'live')
                      .length,
                  },
                  {
                    value: 'mine',
                    label: 'My bets',
                    count: positions.loading ? undefined : stakedCount,
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
                    'flex min-h-[40px] items-center gap-1 whitespace-nowrap rounded-lg px-1.5 text-xs font-semibold min-[375px]:px-2 sm:gap-1.5 sm:px-3 sm:text-sm',
                    filter === item.value
                      ? 'bg-primary-600 text-white'
                      : 'bg-canvas-0 text-ink-600 hover:bg-canvas-100'
                  )}
                >
                  {item.value === 'live' && (
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  )}
                  {item.value === 'mine' && (
                    <TicketIcon className="hidden h-3.5 w-3.5 sm:block" />
                  )}
                  {item.label}
                  <span className="text-xs tabular-nums opacity-70">
                    {item.count}
                  </span>
                </button>
              ))}
            </div>
            <DateMenu
              days={allDays}
              date={date}
              setDate={setDate}
              // Live is now: there's no other day to pick.
              disabled={filter === 'live'}
            />
            <div
              className="border-ink-200 ml-auto flex shrink-0 rounded-lg border p-0.5"
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
                    'flex h-9 w-8 items-center justify-center rounded-md sm:w-9',
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
          {hasFilters && (
            <div
              className="text-ink-500 flex items-center justify-between gap-2 text-xs"
              role="status"
            >
              {filter === 'mine' && myStakes.length > 0 ? (
                <MyBetsSummary stakes={myStakes} />
              ) : (
                <span>
                  {filtered.length} of {everything.length} loaded{' '}
                  {sessions.length > 0 ? 'events' : 'games'}
                </span>
              )}
              <button
                type="button"
                className="text-primary-700 min-h-[32px] shrink-0 whitespace-nowrap font-semibold"
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
          {positions.error && (
            <p className="text-ink-500 text-xs" role="alert">
              Couldn't load your bets.
              <button
                type="button"
                className="text-primary-700 ml-2 underline"
                onClick={() => void positions.refresh()}
              >
                Retry
              </button>
            </p>
          )}
        </div>
        {featured &&
          (isSession(featured) ? (
            <RaceWeekendHero
              key={featured.id}
              event={featured}
              compact={!fullRaceHero}
              likeFor={likeFor}
            />
          ) : (
            <GameRow
              key={featured.id}
              variant="featured"
              game={featured}
              showLeague={showLeague}
              liked={likes.liked.has(featured.id)}
              likeDisabled={likes.disabled(featured.id)}
              onToggleLike={() => void likes.toggle(featured.id)}
              stake={stakes[featured.id]}
              onPositionsChange={() => void positions.refreshGame(featured.id)}
            />
          ))}
        {!hasFilters && belowFeatured}
        {filtered.length === 0 && (
          <div className="border-ink-200 rounded-xl border border-dashed px-5 py-8 text-center">
            <h3 className="text-ink-900 font-semibold">
              {filter === 'mine'
                ? needsSignIn
                  ? 'Sign in to see your bets'
                  : positions.error
                  ? 'Your bets are unavailable'
                  : positions.loading
                  ? 'Loading your bets…'
                  : 'No bets on these games yet'
                : filter === 'live'
                ? sessions.length > 0
                  ? 'Nothing live right now'
                  : 'No games live right now'
                : sessions.length > 0
                ? 'Nothing matches'
                : 'No matching games'}
            </h3>
            <p className="text-ink-500 mt-1 text-sm">
              {filter === 'mine'
                ? 'Tap a price to back a team. Your picks and open orders show up here.'
                : 'Try another date or filter.'}
            </p>
            <button
              type="button"
              onClick={needsSignIn ? firebaseLogin : reset}
              className="text-primary-700 mt-3 min-h-[40px] text-sm font-bold"
            >
              {needsSignIn ? 'Sign in' : 'Show all games'}
            </button>
          </div>
        )}
        {live.length > 0 && (
          <Col className="gap-2">
            <SectionHeader
              label="Live now"
              count={live.length}
              unit={unitFor(live)}
              accent
            />
            {renderItems(live)}
          </Col>
        )}
        {days.map((day) => (
          <Col key={day.key} className="gap-2">
            <SectionHeader
              label={day.label}
              sublabel={dayjs(day.key).format('MMM D')}
              count={day.items.length}
              unit={unitFor(day.items)}
            />
            {renderItems(day.items)}
          </Col>
        ))}
        {hasMore && filter !== 'live' ? (
          <>
            {hasFilters ? (
              <button
                type="button"
                onClick={() => void loadMore()}
                className="text-primary-700 border-ink-200 rounded-lg border p-3 text-sm font-semibold"
              >
                Load more games
              </button>
            ) : (
              <>
                <LoadMoreUntilNotVisible loadMore={loadMore} />
                <FeedSkeleton view={view} rows={2} />
              </>
            )}
          </>
        ) : (
          <p className="text-ink-400 px-1 text-center text-xs">
            {filter === 'live' ? 'All live games' : 'All available games'} ·
            Times shown in your local time zone
          </p>
        )}
      </Col>
    </div>
  )
}

/**
 * Which day the board shows: every date, or one. A menu rather than a strip
 * of day chips, so it shares the filters' row. Shrinks before they do.
 */
function DateMenu(props: {
  days: DaySection<FeedItem>[]
  date: string
  setDate: (date: string) => void
  disabled?: boolean
}) {
  const { days, date, setDate, disabled } = props
  const picked = date !== 'all'
  const total = days.reduce((n, day) => n + day.items.length, 0)
  const label = picked
    ? shortDayLabel(date, days.find((day) => day.key === date)?.label)
    : 'All dates'
  return (
    <DropdownMenu
      className="min-w-0"
      buttonDisabled={disabled}
      buttonClass={clsx(
        'min-h-[40px] max-w-full gap-1 rounded-lg border px-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:text-sm',
        picked
          ? 'border-primary-300 bg-primary-50 !text-primary-700'
          : 'border-ink-200 bg-canvas-0 hover:bg-canvas-100 !text-ink-600'
      )}
      buttonContent={(open) => (
        <>
          <CalendarIcon
            className="hidden h-4 w-4 shrink-0 opacity-70 sm:block"
            aria-hidden
          />
          <span className="sr-only">Date: </span>
          <span className="min-w-0 truncate">{label}</span>
          <ChevronDownIcon
            className={clsx(
              'h-4 w-4 shrink-0 transition-transform',
              open && 'rotate-180'
            )}
            aria-hidden
          />
        </>
      )}
      anchor={{ to: 'bottom start', gap: 8, padding: 8 }}
      menuWidth="w-56"
      menuItemsClass="!max-h-[60vh] overflow-y-auto"
      selectedItemName={date}
      closeOnClick
      items={[
        {
          name: 'all',
          onClick: () => setDate('all'),
          buttonContent: <DateMenuItem label="All dates" count={total} />,
        },
        ...days.map((day) => ({
          name: day.key,
          onClick: () => setDate(day.key),
          buttonContent: (
            <DateMenuItem
              label={day.label}
              sublabel={dayjs(day.key).format('MMM D')}
              count={day.items.length}
            />
          ),
        })),
      ]}
    />
  )
}

function DateMenuItem(props: {
  label: string
  sublabel?: string
  count: number
}) {
  const { label, sublabel, count } = props
  return (
    <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
      <span className="text-ink-900 font-medium">{label}</span>
      {sublabel && <span className="text-ink-500 text-xs">{sublabel}</span>}
      <span className="text-ink-400 ml-auto text-xs tabular-nums">{count}</span>
    </span>
  )
}

/** "Today", "Tomorrow", else "Sat, Nov 7": short enough for the filter row. */
function shortDayLabel(key: string, label: string | undefined) {
  return label === 'Today' || label === 'Tomorrow'
    ? label
    : dayjs(key).format('ddd, MMM D')
}

/** The My bets filter's totals: games, mana in, current value and profit. */
function MyBetsSummary(props: { stakes: GameStake[] }) {
  const totals = sumGameStakes(props.stakes)
  const profit = profitLabel(totals.profit)
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
      <span>
        {totals.games} {totals.games === 1 ? 'game' : 'games'}
      </span>
      {totals.invested > 0 && (
        <>
          <span aria-hidden>·</span>
          <span>{formatMoney(totals.invested)} in</span>
          <span aria-hidden>·</span>
          <span>Worth {formatMoney(totals.value)}</span>
          <span className={clsx('font-semibold', profit.className)}>
            {profit.text}
          </span>
        </>
      )}
      {totals.openOrders > 0 && (
        <>
          <span aria-hidden>·</span>
          <span>
            {totals.openOrders} open{' '}
            {totals.openOrders === 1 ? 'order' : 'orders'}
          </span>
        </>
      )}
    </span>
  )
}

function FeedSkeleton(props: { view: 'cards' | 'compact'; rows: number }) {
  const { view, rows } = props
  const items = Array.from({ length: rows }, (_, i) => (
    <GameRowSkeleton key={i} variant={view === 'cards' ? 'card' : 'compact'} />
  ))
  return (
    <div className={clsx('grid gap-3', view === 'cards' && 'sm:grid-cols-2')}>
      {items}
    </div>
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
