import { ScheduleGame, SportsScheduleResponse } from './sports-schedule'
import { LEAGUE_NAVIGATION_VERSION } from './bdl/league-navigation'
import { LiveGameState, pruneSportsLive } from './sports-schedule-live'

/**
 * What an infinitely scrolling sports feed has loaded: the latest response's
 * page-level fields (rail counts, this week's markets), every game from it
 * and from the pages loaded after it, when each game was read, and where the
 * next page starts.
 */
export type ScheduleFeed = {
  response: SportsScheduleResponse
  unverifiedLeaguePage?: boolean
  games: ScheduleGame[]
  /** Server read time per game, for the live overlay. */
  snapshotTimes: Record<string, number>
  cursor: string | null
}

/**
 * A feed from one response: the first page, or a refresh that re-read every
 * page loaded so far (see refreshLimit). Replacing the pages together keeps
 * the games and the cursor from one read: refreshing only the first page
 * would drop the game it pushes off its end and keep the old pages' cursor.
 */
export function feedFromResponse(
  response: SportsScheduleResponse
): ScheduleFeed {
  const at = response.snapshotTime ?? 0
  return {
    response,
    games: response.games,
    snapshotTimes: Object.fromEntries(response.games.map((g) => [g.id, at])),
    cursor: response.nextCursor,
  }
}

/**
 * How many upcoming games a refresh asks for: as many as are loaded, so one
 * response replaces every page and its cursor carries on from the last one.
 */
export function refreshLimit(
  feed: ScheduleFeed | undefined,
  pageSize: number,
  max: number
) {
  const upcoming =
    feed?.games.filter((g) => g.status === 'upcoming').length ?? 0
  return Math.min(max, Math.max(pageSize, upcoming))
}

/** Refresh all loaded games atomically, including feeds larger than the API's per-request limit. */
export async function refreshLoadedFeed(
  previous: ScheduleFeed | undefined,
  pageSize: number,
  requestLimit: number,
  read: (limit: number, cursor?: string) => Promise<SportsScheduleResponse>,
  isCurrent: () => boolean,
  readAllPages = true
) {
  const target = refreshLimit(previous, pageSize, Infinity)
  const first = await read(Math.min(target, requestLimit))
  if (!isCurrent()) return undefined
  let feed = feedFromResponse(first)
  let upcoming = first.games.filter((g) => g.status === 'upcoming').length
  const pages = [first]
  const visited = new Set<string>()
  while (readAllPages && feed.cursor && upcoming < target) {
    const cursor = feed.cursor
    if (visited.has(cursor)) throw new Error('Repeated sports schedule cursor')
    visited.add(cursor)
    const page = await read(Math.min(target - upcoming, requestLimit), cursor)
    if (!isCurrent()) return undefined
    const adopted = adoptedGames(feed, page)
    pages.push(adopted)
    feed = appendPage(feed, cursor, page)!
    upcoming = feed.games.filter((g) => g.status === 'upcoming').length
  }
  return { feed, pages }
}

/**
 * The feed with the next page appended, or undefined if the feed has moved on
 * since `cursor` was read (a refresh replaced it), so the page is stale.
 */
export function appendPage(
  feed: ScheduleFeed,
  cursor: string,
  page: SportsScheduleResponse
): ScheduleFeed | undefined {
  if (feed.cursor !== cursor) return undefined
  const fresh = adoptedGames(feed, page).games
  const rows = new Map(feed.games.map((g) => [g.id, g]))
  for (const game of fresh) rows.set(game.id, game)
  const at = page.snapshotTime ?? 0
  return {
    ...feed,
    ...(feed.response.leagueNavigationVersion === LEAGUE_NAVIGATION_VERSION &&
      page.leagueNavigationVersion !== LEAGUE_NAVIGATION_VERSION && {
        unverifiedLeaguePage: true,
      }),
    games: [...rows.values()],
    snapshotTimes: {
      ...feed.snapshotTimes,
      ...Object.fromEntries(fresh.map((g) => [g.id, at])),
    },
    cursor: page.nextCursor,
  }
}

/**
 * Keep earlier prices for ordinary duplicates. A newer, verified change of
 * competition or market identity replaces the entire row and its snapshot.
 */
export function adoptedGames(
  feed: ScheduleFeed,
  page: SportsScheduleResponse
): SportsScheduleResponse {
  const have = new Map(feed.games.map((g) => [g.id, g]))
  const games = page.games.filter((g) => {
    const old = have.get(g.id)
    if (!old) return true
    return (
      page.leagueNavigationVersion === LEAGUE_NAVIGATION_VERSION &&
      g.leagueNavigationVersion === LEAGUE_NAVIGATION_VERSION &&
      (page.snapshotTime ?? 0) >= (feed.snapshotTimes[g.id] ?? 0) &&
      (old.leagueNavigationVersion !== g.leagueNavigationVersion ||
        old.navigationLeagueKey !== g.navigationLeagueKey ||
        old.sportsEventId !== g.sportsEventId)
    )
  })
  return { ...page, games }
}

/**
 * Prunes the live overlay against one response, for that response's games
 * only: other rows were read at other times. For a page, pass adoptedGames:
 * pruning a row against a duplicate that was dropped would throw away a
 * newer live price and put the row back to its older read.
 */
export function pruneLiveForPage(
  live: Record<string, LiveGameState>,
  page: SportsScheduleResponse
): Record<string, LiveGameState> {
  const ids = new Set(page.games.map((g) => g.id))
  const onPage: Record<string, LiveGameState> = {}
  const rest: Record<string, LiveGameState> = {}
  for (const [id, state] of Object.entries(live)) {
    if (ids.has(id)) onPage[id] = state
    else rest[id] = state
  }
  const pruned = pruneSportsLive(onPage, page)
  return pruned === onPage ? live : { ...rest, ...pruned }
}
