import { Contract, isSportsContract } from './contract'
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

export const getIsLive = (contract: Contract) => {
  const now = Date.now()
  const sportsStartTimestamp = isSportsContract(contract)
    ? contract.sportsStartTimestamp
    : undefined
  if (!sportsStartTimestamp) return false
  const start = new Date(sportsStartTimestamp + 'Z').getTime()
  return now >= start && now < (contract.closeTime ?? start + 3 * HOUR_MS)
}
