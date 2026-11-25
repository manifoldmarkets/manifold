import { isSportsBdlEnabled } from './bdl/rollout'
import type { ScheduleGame } from './sports-schedule'

/** Initial schedule window shared by the page and its social preview. */
export const SPORTS_SCHEDULE_PAGE_SIZE = 20

export function canBetOnScheduledGame(game: ScheduleGame, now: number) {
  if (game.isResolved || game.status === 'finished') return false
  if (
    game.gameState === 'settling' ||
    game.gameState === 'final' ||
    game.gameState === 'canceled'
  )
    return false
  return !game.sportsLeagueKey || game.closeTime > now
}

type FeedTime = Pick<ScheduleGame, 'startTime' | 'gameState' | 'resumptionTime'>

/** A suspended or postponed game is listed under its confirmed resumption.
 * Its original kickoff still describes the game itself. */
export function scheduleFeedTime({
  startTime,
  gameState,
  resumptionTime,
}: FeedTime) {
  if (
    isSportsBdlEnabled() &&
    (gameState === 'suspended' || gameState === 'postponed') &&
    resumptionTime != null &&
    Number.isFinite(resumptionTime) &&
    resumptionTime >= 0 &&
    resumptionTime <= 8.64e15
  )
    return resumptionTime
  return startTime
}

type GameOrder = Pick<ScheduleGame, 'id' | 'status' | 'volume'> & FeedTime

/** Keep each team's score and bet target together when changing display order. */
export function getGameDisplayTeams<Team>(game: {
  home: Team
  away: Team
  draw: unknown
}) {
  const home = {
    team: game.home,
    side: 'home' as const,
    outcome: 'teamA' as const,
  }
  const away = {
    team: game.away,
    side: 'away' as const,
    outcome: 'teamB' as const,
  }
  // Match #4159: soccer is home first; versus markets are away first.
  return game.draw ? [home, away] : [away, home]
}

export const compareGameStartTime = (a: GameOrder, b: GameOrder) =>
  scheduleFeedTime(a) - scheduleFeedTime(b) ||
  (isSportsBdlEnabled()
    ? a.id < b.id
      ? -1
      : a.id > b.id
      ? 1
      : 0
    : a.id.localeCompare(b.id))

const safeVolume = (game: GameOrder) =>
  Number.isFinite(game.volume) ? Math.max(0, game.volume) : 0

export const compareGameVolume = (a: GameOrder, b: GameOrder) =>
  safeVolume(b) - safeVolume(a) || compareGameStartTime(a, b)

/**
 * Retain the current game while browsing; promote a live game when one starts.
 * Otherwise the most traded, or with `by: 'start'` the soonest: what's on next
 * (F1, whose sessions never overlap). Start times don't move like volume, so
 * that keeps only a live pick: an earlier session that turns up takes over.
 */
export function selectFeaturedGame<T extends GameOrder>(
  games: readonly T[],
  currentId?: string,
  by: 'volume' | 'start' = 'volume'
) {
  const current = games.find((game) => game.id === currentId)
  if (
    current?.status === 'live' ||
    (by === 'volume' &&
      current?.status === 'upcoming' &&
      !games.some((game) => game.status === 'live'))
  )
    return current
  return games
    .filter((game) => game.status === 'live' || game.status === 'upcoming')
    .sort(
      (a, b) =>
        Number(b.status === 'live') - Number(a.status === 'live') ||
        (by === 'start' ? compareGameStartTime(a, b) : compareGameVolume(a, b))
    )[0]
}
