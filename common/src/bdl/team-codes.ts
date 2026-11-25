import type { BdlLeagueKey } from './leagues'

// Active NBA teams from the recorded team directory. IDs belong to one league.
const teamCodes: Partial<
  Record<BdlLeagueKey, Readonly<Record<string, string>>>
> = {
  nba: {
    '1': 'ATL', // Atlanta Hawks
    '2': 'BOS', // Boston Celtics
    '3': 'BKN', // Brooklyn Nets
    '4': 'CHA', // Charlotte Hornets
    '5': 'CHI', // Chicago Bulls
    '6': 'CLE', // Cleveland Cavaliers
    '7': 'DAL', // Dallas Mavericks
    '8': 'DEN', // Denver Nuggets
    '9': 'DET', // Detroit Pistons
    '10': 'GSW', // Golden State Warriors
    '11': 'HOU', // Houston Rockets
    '12': 'IND', // Indiana Pacers
    '13': 'LAC', // LA Clippers
    '14': 'LAL', // Los Angeles Lakers
    '15': 'MEM', // Memphis Grizzlies
    '16': 'MIA', // Miami Heat
    '17': 'MIL', // Milwaukee Bucks
    '18': 'MIN', // Minnesota Timberwolves
    '19': 'NOP', // New Orleans Pelicans
    '20': 'NYK', // New York Knicks
    '21': 'OKC', // Oklahoma City Thunder
    '22': 'ORL', // Orlando Magic
    '23': 'PHI', // Philadelphia 76ers
    '24': 'PHX', // Phoenix Suns
    '25': 'POR', // Portland Trail Blazers
    '26': 'SAC', // Sacramento Kings
    '27': 'SAS', // San Antonio Spurs
    '28': 'TOR', // Toronto Raptors
    '29': 'UTA', // Utah Jazz
    '30': 'WAS', // Washington Wizards
  },
}

export function recordedTeamCode(league: BdlLeagueKey, entrantId?: string) {
  const teams = teamCodes[league]
  return teams &&
    entrantId &&
    Object.prototype.hasOwnProperty.call(teams, entrantId)
    ? teams[entrantId]
    : undefined
}
