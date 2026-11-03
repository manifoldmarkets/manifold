import { SPORT_LEAGUE_LABEL, SportId } from './sports-calendar'
import { parseSportsStart } from './sports-schedule'
import { normalizeTeam } from './sports-team-colors'

// ─── Where a game is played, and its local start time ─────────────────────────
//
// A game market shows when it starts in the venue's own time zone, the way
// the game is talked about ("1:00pm ET"). The provider gives a UTC kickoff and
// the two teams but no venue, so the venue is the home team's city, unless
// the game is on the neutral-site list below. Only the NFL and NBA for now:
// their teams have fixed home cities.

const NY = 'America/New_York'
const CHI = 'America/Chicago'
const DEN = 'America/Denver'
const PHX = 'America/Phoenix'
const LA = 'America/Los_Angeles'
const DET = 'America/Detroit'
const IND = 'America/Indiana/Indianapolis'

const NFL: Record<string, string> = {
  'Arizona Cardinals': PHX,
  'Atlanta Falcons': NY,
  'Baltimore Ravens': NY,
  'Buffalo Bills': NY,
  'Carolina Panthers': NY,
  'Chicago Bears': CHI,
  'Cincinnati Bengals': NY,
  'Cleveland Browns': NY,
  'Dallas Cowboys': CHI,
  'Denver Broncos': DEN,
  'Detroit Lions': DET,
  'Green Bay Packers': CHI,
  'Houston Texans': CHI,
  'Indianapolis Colts': IND,
  'Jacksonville Jaguars': NY,
  'Kansas City Chiefs': CHI,
  'Las Vegas Raiders': LA,
  'Los Angeles Chargers': LA,
  'Los Angeles Rams': LA,
  'Miami Dolphins': NY,
  'Minnesota Vikings': CHI,
  'New England Patriots': NY,
  'New Orleans Saints': CHI,
  'New York Giants': NY,
  'New York Jets': NY,
  'Philadelphia Eagles': NY,
  'Pittsburgh Steelers': NY,
  'San Francisco 49ers': LA,
  'Seattle Seahawks': LA,
  'Tampa Bay Buccaneers': NY,
  'Tennessee Titans': CHI,
  'Washington Commanders': NY,
}

const NBA: Record<string, string> = {
  'Atlanta Hawks': NY,
  'Boston Celtics': NY,
  'Brooklyn Nets': NY,
  'Charlotte Hornets': NY,
  'Chicago Bulls': CHI,
  'Cleveland Cavaliers': NY,
  'Dallas Mavericks': CHI,
  'Denver Nuggets': DEN,
  'Detroit Pistons': DET,
  'Golden State Warriors': LA,
  'Houston Rockets': CHI,
  'Indiana Pacers': IND,
  'Los Angeles Clippers': LA,
  'Los Angeles Lakers': LA,
  'Memphis Grizzlies': CHI,
  'Miami Heat': NY,
  'Milwaukee Bucks': CHI,
  'Minnesota Timberwolves': CHI,
  'New Orleans Pelicans': CHI,
  'New York Knicks': NY,
  'Oklahoma City Thunder': CHI,
  'Orlando Magic': NY,
  'Philadelphia 76ers': NY,
  'Phoenix Suns': PHX,
  'Portland Trail Blazers': LA,
  'Sacramento Kings': LA,
  'San Antonio Spurs': CHI,
  'Toronto Raptors': 'America/Toronto',
  'Utah Jazz': DEN,
  'Washington Wizards': NY,
}

export const TEAM_TIME_ZONES: Partial<Record<SportId, Record<string, string>>> =
  { nfl: NFL, nba: NBA }

export interface NeutralSiteGame {
  sport: SportId
  /** The local date at the venue, YYYY-MM-DD. */
  date: string
  /** Both teams, either way round; omit when they aren't known yet. */
  teams?: [string, string]
  venue: string
  timeZone: string
}

/**
 * Games not played in the home team's city. Add each season's as they're
 * announced. A game listed without teams matches every game of its sport
 * that day, so only list one that way when it's the sole game that day.
 */
export const NEUTRAL_SITE_GAMES: NeutralSiteGame[] = [
  // NFL 2026 international games
  {
    sport: 'nfl',
    date: '2026-09-10',
    teams: ['San Francisco 49ers', 'Los Angeles Rams'],
    venue: 'Melbourne Cricket Ground, Melbourne',
    timeZone: 'Australia/Melbourne',
  },
  {
    sport: 'nfl',
    date: '2026-09-27',
    teams: ['Baltimore Ravens', 'Dallas Cowboys'],
    venue: 'Maracanã, Rio de Janeiro',
    timeZone: 'America/Sao_Paulo',
  },
  {
    sport: 'nfl',
    date: '2026-10-04',
    teams: ['Indianapolis Colts', 'Washington Commanders'],
    venue: 'Tottenham Hotspur Stadium, London',
    timeZone: 'Europe/London',
  },
  {
    sport: 'nfl',
    date: '2026-10-11',
    teams: ['Philadelphia Eagles', 'Jacksonville Jaguars'],
    venue: 'Tottenham Hotspur Stadium, London',
    timeZone: 'Europe/London',
  },
  {
    sport: 'nfl',
    date: '2026-10-18',
    teams: ['Houston Texans', 'Jacksonville Jaguars'],
    venue: 'Wembley Stadium, London',
    timeZone: 'Europe/London',
  },
  {
    sport: 'nfl',
    date: '2026-10-25',
    teams: ['Pittsburgh Steelers', 'New Orleans Saints'],
    venue: 'Stade de France, Paris',
    timeZone: 'Europe/Paris',
  },
  {
    sport: 'nfl',
    date: '2026-11-08',
    teams: ['Cincinnati Bengals', 'Atlanta Falcons'],
    venue: 'Bernabéu, Madrid',
    timeZone: 'Europe/Madrid',
  },
  {
    sport: 'nfl',
    date: '2026-11-15',
    teams: ['New England Patriots', 'Detroit Lions'],
    venue: 'Allianz Arena, Munich',
    timeZone: 'Europe/Berlin',
  },
  {
    sport: 'nfl',
    date: '2026-11-22',
    teams: ['Minnesota Vikings', 'San Francisco 49ers'],
    venue: 'Estadio Azteca, Mexico City',
    timeZone: 'America/Mexico_City',
  },
  // Super Bowl LXI: the only NFL game that day.
  {
    sport: 'nfl',
    date: '2027-02-14',
    venue: 'SoFi Stadium, Inglewood',
    timeZone: LA,
  },
  // NBA 2026–27 international games
  {
    sport: 'nba',
    date: '2026-11-07',
    teams: ['Denver Nuggets', 'Indiana Pacers'],
    venue: 'Arena CDMX, Mexico City',
    timeZone: 'America/Mexico_City',
  },
  {
    sport: 'nba',
    date: '2027-01-14',
    teams: ['San Antonio Spurs', 'New Orleans Pelicans'],
    venue: 'Accor Arena, Paris',
    timeZone: 'Europe/Paris',
  },
  {
    sport: 'nba',
    date: '2027-01-17',
    teams: ['San Antonio Spurs', 'New Orleans Pelicans'],
    venue: 'Co-op Live, Manchester',
    timeZone: 'Europe/London',
  },
  // NBA Cup Championship: the only NBA game that day.
  {
    sport: 'nba',
    date: '2026-12-11',
    venue: 'Hinkle Fieldhouse, Indianapolis',
    timeZone: IND,
  },
]

const NORMALIZED: Partial<Record<SportId, Map<string, string>>> =
  Object.fromEntries(
    Object.entries(TEAM_TIME_ZONES).map(([sport, teams]) => [
      sport,
      new Map(
        Object.entries(teams).map(([name, zone]) => [normalizeTeam(name), zone])
      ),
    ])
  )

/** YYYY-MM-DD for an instant in a time zone. */
function localDate(ms: number, timeZone: string): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms))
}

/** The venue's time zone, or undefined when we can't tell where it's played. */
export function venueTimeZone(
  sport: SportId,
  homeTeam: string,
  awayTeam: string | undefined,
  startMs: number
): string | undefined {
  const names = new Set(
    [homeTeam, awayTeam].filter((t): t is string => !!t).map(normalizeTeam)
  )
  const neutral = NEUTRAL_SITE_GAMES.find(
    (g) =>
      g.sport === sport &&
      g.date === localDate(startMs, g.timeZone) &&
      (!g.teams || g.teams.every((t) => names.has(normalizeTeam(t))))
  )
  if (neutral) return neutral.timeZone
  return NORMALIZED[sport]?.get(normalizeTeam(homeTeam))
}

const START_WORD: Partial<Record<SportId, string>> = {
  nfl: 'Kickoff',
  nba: 'Tip-off',
}

/** "Sun, Nov 8, 3:30pm CET" in the given time zone. */
export function formatLocalStart(ms: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).formatToParts(new Date(ms))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  // US zones read best as EST/PST; elsewhere en-GB gives CET, GMT, BST.
  const zone =
    new Intl.DateTimeFormat(
      timeZone.startsWith('America/') ? 'en-US' : 'en-GB',
      {
        timeZone,
        timeZoneName: 'short',
      }
    )
      .formatToParts(new Date(ms))
      .find((p) => p.type === 'timeZoneName')?.value ?? ''
  const time = `${get('hour')}:${get('minute')}${get(
    'dayPeriod'
  ).toLowerCase()}`
  return `${get('weekday')}, ${get('month')} ${get(
    'day'
  )}, ${time} ${zone}`.trim()
}

/**
 * "Kickoff Sun, Nov 8, 3:30pm CET" for an NFL or NBA game market that hasn't
 * started, in the venue's time zone; undefined for anything else.
 */
export function gameStartLabel(
  market: {
    sportsLeague?: string
    sportsHomeTeam?: string
    sportsAwayTeam?: string
    sportsStartTimestamp?: string
  },
  now = Date.now()
): string | undefined {
  const sport = (Object.keys(START_WORD) as SportId[]).find(
    (id) => SPORT_LEAGUE_LABEL[id] === market.sportsLeague
  )
  if (!sport || !market.sportsHomeTeam) return undefined
  const start = parseSportsStart(market.sportsStartTimestamp)
  if (start === null || now >= start) return undefined
  const zone = venueTimeZone(
    sport,
    market.sportsHomeTeam,
    market.sportsAwayTeam,
    start
  )
  if (!zone) return undefined
  return `${START_WORD[sport]} ${formatLocalStart(start, zone)}`
}
