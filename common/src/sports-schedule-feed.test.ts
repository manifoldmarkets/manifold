import { ScheduleGame, SportsScheduleResponse } from './sports-schedule'
import {
  adoptedGames,
  appendPage,
  feedFromResponse,
  pruneLiveForPage,
  refreshLimit,
  ScheduleFeed,
} from './sports-schedule-feed'
import { LiveGameState } from './sports-schedule-live'

const PAGE = 20
const MAX = 400

const game = (id: string, startTime: number) =>
  ({ id, startTime, status: 'upcoming' } as ScheduleGame)

// The endpoint's paging (backend/api/src/sports-schedule.ts): upcoming games
// by kickoff, then id, `limit` at a time, continuing after `cursor`.
function serve(
  games: ScheduleGame[],
  props: { limit: number; cursor?: string }
): SportsScheduleResponse {
  const ordered = [...games].sort(
    (a, b) => a.startTime - b.startTime || (a.id < b.id ? -1 : 1)
  )
  const [t, id] = props.cursor?.split('_') ?? []
  const later = props.cursor
    ? ordered.filter(
        (g) => g.startTime > +t || (g.startTime === +t && g.id > id)
      )
    : ordered
  const page = later.slice(0, props.limit)
  const last = page[page.length - 1]
  return {
    snapshotTime: 1,
    games: page,
    nextCursor:
      later.length > page.length && last
        ? `${last.startTime}_${last.id}`
        : null,
    upcoming: [],
    counts: {},
    liveCount: 0,
    sports: [],
  }
}

const loadMore = (feed: ScheduleFeed, games: ScheduleGame[]) =>
  appendPage(
    feed,
    feed.cursor!,
    serve(games, { limit: PAGE, cursor: feed.cursor! })
  )!

const refresh = (feed: ScheduleFeed, games: ScheduleGame[]) =>
  feedFromResponse(serve(games, { limit: refreshLimit(feed, PAGE, MAX) }))

// A1…A40, an hour apart.
const schedule = Array.from({ length: 40 }, (_, i) =>
  game(`A${String(i + 1).padStart(2, '0')}`, (i + 10) * 3600)
)

it('keeps every game when a refresh brings in an earlier one', () => {
  let feed = feedFromResponse(serve(schedule, { limit: PAGE }))
  feed = loadMore(feed, schedule)
  expect(feed.games).toHaveLength(40)

  // A new game kicks off before A01. Refreshing only the first page would
  // return N, A01–A19 and keep the old A21–A40, losing A20.
  const withNew = [game('N', 3600), ...schedule]
  feed = refresh(feed, withNew)
  while (feed.cursor) feed = loadMore(feed, withNew)
  expect(feed.games.map((g) => g.id)).toEqual(withNew.map((g) => g.id))
})

it('finds games added after the feed reached its end', () => {
  let feed = feedFromResponse(serve(schedule, { limit: PAGE }))
  feed = loadMore(feed, schedule)
  expect(feed.cursor).toBeNull()

  // A later game is created. The refreshed cursor has to be the one used,
  // not the null left by the old last page.
  const withLater = [...schedule, game('Z', 99 * 3600)]
  feed = refresh(feed, withLater)
  expect(feed.cursor).not.toBeNull()
  feed = loadMore(feed, withLater)
  expect(feed.games.map((g) => g.id)).toEqual(withLater.map((g) => g.id))
  expect(feed.cursor).toBeNull()
})

it('drops a page whose cursor a refresh has replaced', () => {
  const feed = feedFromResponse(serve(schedule, { limit: PAGE }))
  const staleCursor = feed.cursor!
  const refreshed = refresh(feed, [game('N', 3600), ...schedule])
  expect(
    appendPage(
      refreshed,
      staleCursor,
      serve(schedule, { limit: PAGE, cursor: staleCursor })
    )
  ).toBeUndefined()
})

it('asks a refresh for as many games as are loaded, within the limits', () => {
  expect(refreshLimit(undefined, PAGE, MAX)).toBe(PAGE)
  const feed = loadMore(
    feedFromResponse(serve(schedule, { limit: PAGE })),
    schedule
  )
  expect(refreshLimit(feed, PAGE, MAX)).toBe(40)
  expect(refreshLimit(feed, PAGE, 30)).toBe(30)
})

it('keeps a newer live price when a later page repeats the game', () => {
  // G was read at 50% (snapshot 1), then a live update moved it to 60% (at
  // 2). Rescheduled past the cursor, it turns up again on a later page read
  // at 3, which appendPage drops as a duplicate.
  const g = game('G', 50 * 3600)
  const feed: ScheduleFeed = {
    ...feedFromResponse(serve([g], { limit: PAGE })),
    cursor: 'next',
  }
  const live: Record<string, LiveGameState> = {
    G: { probs: { home: { value: 0.6, at: 2 } } },
  }
  const page = { ...serve([g], { limit: PAGE }), snapshotTime: 3 }

  // The duplicate is dropped: the row keeps its first read.
  const appended = appendPage(feed, 'next', page)!
  expect(appended.games.map((x) => x.id)).toEqual(['G'])
  expect(appended.snapshotTimes.G).toBe(1)
  // Pruned against the whole page, the 60% would go and the row show 50%.
  expect(pruneLiveForPage(live, page).G).toBeUndefined()
  // Against what the feed actually took, it stays.
  expect(pruneLiveForPage(live, adoptedGames(feed, page)).G).toEqual(live.G)
})
