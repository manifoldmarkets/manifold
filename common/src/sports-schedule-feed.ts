import { ScheduleGame, SportsScheduleResponse } from './sports-schedule'

/**
 * What an infinitely scrolling sports feed has loaded: the latest response's
 * page-level fields (rail counts, this week's markets), every game from it
 * and from the pages loaded after it, when each game was read, and where the
 * next page starts.
 */
export type ScheduleFeed = {
  response: SportsScheduleResponse
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
  const have = new Set(feed.games.map((g) => g.id))
  const fresh = page.games.filter((g) => !have.has(g.id))
  const at = page.snapshotTime ?? 0
  return {
    ...feed,
    games: [...feed.games, ...fresh],
    snapshotTimes: {
      ...feed.snapshotTimes,
      ...Object.fromEntries(fresh.map((g) => [g.id, at])),
    },
    cursor: page.nextCursor,
  }
}
