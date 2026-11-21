import { NFL_TEAM_TLA } from './sports'
import { SPORT_LEAGUE_LABEL, SportId } from './sports-calendar'
import { normalizeTeam } from './sports-team-colors'

// ─── Team codes for game markets ──────────────────────────────────────────────
//
// The short code a game's answers carry ("NYY", "ARS"): the /sports badge
// shows it, and the schedule counts it as naming the team when it matches
// other markets to a game. Keyed by the names The Odds API uses, the same
// names as the team colours. A team not listed falls back to its name.

const MLB: Record<string, string> = {
  'Arizona Diamondbacks': 'ARI',
  Athletics: 'ATH',
  'Oakland Athletics': 'ATH',
  'Atlanta Braves': 'ATL',
  'Baltimore Orioles': 'BAL',
  'Boston Red Sox': 'BOS',
  'Chicago Cubs': 'CHC',
  'Chicago White Sox': 'CWS',
  'Cincinnati Reds': 'CIN',
  'Cleveland Guardians': 'CLE',
  'Colorado Rockies': 'COL',
  'Detroit Tigers': 'DET',
  'Houston Astros': 'HOU',
  'Kansas City Royals': 'KC',
  'Los Angeles Angels': 'LAA',
  'Los Angeles Dodgers': 'LAD',
  'Miami Marlins': 'MIA',
  'Milwaukee Brewers': 'MIL',
  'Minnesota Twins': 'MIN',
  'New York Mets': 'NYM',
  'New York Yankees': 'NYY',
  'Philadelphia Phillies': 'PHI',
  'Pittsburgh Pirates': 'PIT',
  'San Diego Padres': 'SD',
  'San Francisco Giants': 'SF',
  'Seattle Mariners': 'SEA',
  'St. Louis Cardinals': 'STL',
  'St Louis Cardinals': 'STL',
  'Tampa Bay Rays': 'TB',
  'Texas Rangers': 'TEX',
  'Toronto Blue Jays': 'TOR',
  'Washington Nationals': 'WSH',
}

const NBA: Record<string, string> = {
  'Atlanta Hawks': 'ATL',
  'Boston Celtics': 'BOS',
  'Brooklyn Nets': 'BKN',
  'Charlotte Hornets': 'CHA',
  'Chicago Bulls': 'CHI',
  'Cleveland Cavaliers': 'CLE',
  'Dallas Mavericks': 'DAL',
  'Denver Nuggets': 'DEN',
  'Detroit Pistons': 'DET',
  'Golden State Warriors': 'GSW',
  'Houston Rockets': 'HOU',
  'Indiana Pacers': 'IND',
  'Los Angeles Clippers': 'LAC',
  'Los Angeles Lakers': 'LAL',
  'Memphis Grizzlies': 'MEM',
  'Miami Heat': 'MIA',
  'Milwaukee Bucks': 'MIL',
  'Minnesota Timberwolves': 'MIN',
  'New Orleans Pelicans': 'NOP',
  'New York Knicks': 'NYK',
  'Oklahoma City Thunder': 'OKC',
  'Orlando Magic': 'ORL',
  'Philadelphia 76ers': 'PHI',
  'Phoenix Suns': 'PHX',
  'Portland Trail Blazers': 'POR',
  'Sacramento Kings': 'SAC',
  'San Antonio Spurs': 'SAS',
  'Toronto Raptors': 'TOR',
  'Utah Jazz': 'UTA',
  'Washington Wizards': 'WAS',
}

const WNBA: Record<string, string> = {
  'Atlanta Dream': 'ATL',
  'Chicago Sky': 'CHI',
  'Connecticut Sun': 'CON',
  'Dallas Wings': 'DAL',
  'Golden State Valkyries': 'GSV',
  'Indiana Fever': 'IND',
  'Las Vegas Aces': 'LVA',
  'Los Angeles Sparks': 'LAS',
  'Minnesota Lynx': 'MIN',
  'New York Liberty': 'NYL',
  'Phoenix Mercury': 'PHO',
  'Seattle Storm': 'SEA',
  'Washington Mystics': 'WAS',
}

// The Premier League and the clubs moving in and out of it.
const SOCCER: Record<string, string> = {
  Arsenal: 'ARS',
  'Aston Villa': 'AVL',
  Bournemouth: 'BOU',
  Brentford: 'BRE',
  'Brighton and Hove Albion': 'BHA',
  Burnley: 'BUR',
  Chelsea: 'CHE',
  'Coventry City': 'COV',
  'Crystal Palace': 'CRY',
  Everton: 'EVE',
  Fulham: 'FUL',
  'Hull City': 'HUL',
  'Ipswich Town': 'IPS',
  'Leeds United': 'LEE',
  'Leicester City': 'LEI',
  Liverpool: 'LIV',
  'Manchester City': 'MCI',
  'Manchester United': 'MUN',
  Middlesbrough: 'MID',
  'Newcastle United': 'NEW',
  'Nottingham Forest': 'NFO',
  'Sheffield United': 'SHU',
  Southampton: 'SOU',
  Sunderland: 'SUN',
  'Tottenham Hotspur': 'TOT',
  'West Ham United': 'WHU',
  'Wolverhampton Wanderers': 'WOL',
}

const NHL: Record<string, string> = {
  'Anaheim Ducks': 'ANA',
  'Boston Bruins': 'BOS',
  'Buffalo Sabres': 'BUF',
  'Calgary Flames': 'CGY',
  'Carolina Hurricanes': 'CAR',
  'Chicago Blackhawks': 'CHI',
  'Colorado Avalanche': 'COL',
  'Columbus Blue Jackets': 'CBJ',
  'Dallas Stars': 'DAL',
  'Detroit Red Wings': 'DET',
  'Edmonton Oilers': 'EDM',
  'Florida Panthers': 'FLA',
  'Los Angeles Kings': 'LAK',
  'Minnesota Wild': 'MIN',
  'Montreal Canadiens': 'MTL',
  'Nashville Predators': 'NSH',
  'New Jersey Devils': 'NJD',
  'New York Islanders': 'NYI',
  'New York Rangers': 'NYR',
  'Ottawa Senators': 'OTT',
  'Philadelphia Flyers': 'PHI',
  'Pittsburgh Penguins': 'PIT',
  'San Jose Sharks': 'SJS',
  'Seattle Kraken': 'SEA',
  'St. Louis Blues': 'STL',
  'Tampa Bay Lightning': 'TBL',
  'Toronto Maple Leafs': 'TOR',
  'Utah Mammoth': 'UTA',
  'Utah Hockey Club': 'UTA',
  'Vancouver Canucks': 'VAN',
  'Vegas Golden Knights': 'VGK',
  'Washington Capitals': 'WSH',
  'Winnipeg Jets': 'WPG',
}

export const TEAM_CODES: Partial<Record<SportId, Record<string, string>>> = {
  nfl: NFL_TEAM_TLA,
  mlb: MLB,
  nba: NBA,
  wnba: WNBA,
  soccer: SOCCER,
  nhl: NHL,
}

const NORMALIZED: Partial<Record<SportId, Map<string, string>>> =
  Object.fromEntries(
    Object.entries(TEAM_CODES).map(([sport, teams]) => [
      sport,
      new Map(
        Object.entries(teams).map(([name, code]) => [normalizeTeam(name), code])
      ),
    ])
  )

export function teamCode(sport: SportId, team: string): string | undefined {
  return NORMALIZED[sport]?.get(normalizeTeam(team))
}

/** A team's code from a market's `sportsLeague` label ("MLB", "Soccer"). */
export function teamCodeForLeague(
  league: string | undefined,
  team: string
): string | undefined {
  const sport = (Object.keys(SPORT_LEAGUE_LABEL) as SportId[]).find(
    (id) => SPORT_LEAGUE_LABEL[id] === league
  )
  return sport ? teamCode(sport, team) : undefined
}
