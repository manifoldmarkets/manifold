import { BDL_LEAGUES, BDL_LEAGUE_KEYS } from './leagues'

const registeredSports = new Set<string>(
  BDL_LEAGUE_KEYS.map((key) => BDL_LEAGUES[key].sportKey).filter(
    (sport) => sport !== 'other'
  )
)
export const isRegisteredSport = (sport: string) => registeredSports.has(sport)
