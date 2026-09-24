import { Contract, isSportsContract } from './contract'
import { parseSportsStart } from './sports-schedule'
import { HOUR_MS } from './util/time'

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
  intHomeScore: string
  intAwayScore: string
  dateEvent: string
  strTime: string
  strTimestamp: string
  idHomeTeam: string
  idAwayTeam: string
  strHomeTeamBadge: string
  strAwayTeamBadge: string
  homeTeamMetadata: TeamMetadata
  awayTeamMetadata: TeamMetadata
  strStatus: string
  idLeague: string
}

export const getIsLive = (contract: Contract) => {
  const now = Date.now()
  const sportsStartTimestamp = isSportsContract(contract)
    ? contract.sportsStartTimestamp
    : undefined
  // Older pipelines store naive UTC timestamps, The Odds API full ISO ones.
  const start = parseSportsStart(sportsStartTimestamp)
  if (start === null) return false
  return now >= start && now < (contract.closeTime ?? start + 3 * HOUR_MS)
}
