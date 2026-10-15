import { ScheduleGame } from 'common/sports-schedule'

type GameOrder = Pick<ScheduleGame, 'id' | 'status' | 'startTime' | 'volume'>

/** Keep each team's score and bet target together when changing display order. */
export function getGameDisplayTeams(
  game: Pick<ScheduleGame, 'home' | 'away' | 'draw'>
) {
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
  a.startTime - b.startTime || a.id.localeCompare(b.id)

const safeVolume = (game: GameOrder) =>
  Number.isFinite(game.volume) ? Math.max(0, game.volume) : 0

export const compareGameVolume = (a: GameOrder, b: GameOrder) =>
  safeVolume(b) - safeVolume(a) || compareGameStartTime(a, b)

/** One live game takes priority over any upcoming game, then volume. */
export function selectFeaturedGame<T extends GameOrder>(games: readonly T[]) {
  return games
    .filter((game) => game.status === 'live' || game.status === 'upcoming')
    .sort(
      (a, b) =>
        Number(b.status === 'live') - Number(a.status === 'live') ||
        compareGameVolume(a, b)
    )[0]
}
