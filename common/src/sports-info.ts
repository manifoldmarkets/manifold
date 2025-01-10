export interface TeamMetadata {
  strTeam: string
  strTeamShort: string
}

export interface SportsGames {
  idEvent: string
  strLeague: string
  strEvent: string
  strHomeTeam: string
  strAwayTeam: string
  dateEvent: string
  strTime: string
  strTimestamp: string
  idHomeTeam: string
  idAwayTeam: string
  strHomeTeamBadge: string
  strAwayTeamBadge: string
  homeTeamMetadata: TeamMetadata
  awayTeamMetadata: TeamMetadata
}
