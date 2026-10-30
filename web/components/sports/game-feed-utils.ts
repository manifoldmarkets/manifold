import { getGameDisplayTeams as getDisplayTeams } from 'common/sports-game-feed'
import { ScheduleGame } from 'common/sports-schedule'

// Shared by the interactive feed and its server-rendered social preview.
export {
  compareGameStartTime,
  compareGameVolume,
  selectFeaturedGame,
} from 'common/sports-game-feed'

/** Typed for the feed, so `ReturnType` keeps the full ScheduleTeam. */
export const getGameDisplayTeams = (
  game: Pick<ScheduleGame, 'home' | 'away' | 'draw'>
) => getDisplayTeams(game)
