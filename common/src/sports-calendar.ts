import type { SportKey } from './sports-schedule'

// ─── The sports calendar ─────────────────────────────────────────────────────
//
// Which competitions the Odds API pipeline creates and resolves markets for,
// and when. Plain data checked into the repo: a change is a one-line PR, and
// every process (scheduler, API, admin page) reads the same list with nothing
// to seed or sync. Status is computed from the dates at run time.

export type SportId =
  | 'nfl'
  | 'cfb'
  | 'f1'
  | 'tdf'
  | 'soccer'
  | 'mlb'
  | 'nba'
  | 'wnba'

export type SportsCalendarStatus = 'upcoming' | 'active' | 'completed'

export interface SportsCalendarEntry {
  sport: SportId
  /** Human-readable competition name, e.g. "NFL Regular Season 2026–27" */
  competition: string
  /** Stable slug, e.g. "nfl-regular-2026"; ties the phases of one competition together */
  competitionId: string
  /** Phase within the competition, e.g. "Regular Season", "Wild Card", "Week 1" */
  phase: string
  /** ISO date YYYY-MM-DD */
  startDate: string
  /** ISO date YYYY-MM-DD */
  endDate: string
  /** Create markets for games in this window */
  autoCreate: boolean
  /** Resolve markets when games finish */
  autoResolve: boolean
  /**
   * Games can end level, so the market is three-way (home, away, Draw).
   * Defaults to true for soccer and false for everything else; a false
   * default means a tie resolves the binary market at 50%.
   */
  tiesAllowed?: boolean
  notes?: string
  /** The Odds API sport key. Competitions without one are created by hand. */
  oddsKey?: string
}

type CalendarInput = Omit<SportsCalendarEntry, 'oddsKey'>

// The Odds API sport key per competition. F1 and the Tour de France are
// deliberately absent: the provider's coverage is not enough to resolve from
// scores, so those stay manual. UCL was not in the catalogue as of Aug 2026
// (re-check when the 2026-27 season opens); NWSL is not covered at all.
const ODDS_KEY_BY_COMPETITION: Record<string, string> = {
  'nfl-preseason-2026': 'americanfootball_nfl_preseason',
  'nfl-regular-2026': 'americanfootball_nfl',
  'nfl-playoffs-2027': 'americanfootball_nfl',
  'cfb-regular-2026': 'americanfootball_ncaaf',
  'cfb-cfp-2027': 'americanfootball_ncaaf',
  'mlb-2026': 'baseball_mlb',
  'mlb-2027': 'baseball_mlb',
  'nba-regular-2026-27': 'basketball_nba',
  'nba-playoffs-2027': 'basketball_nba',
  'wnba-2026': 'basketball_wnba',
  'wnba-2027': 'basketball_wnba',
  'epl-2026-27': 'soccer_epl',
  'mls-2026': 'soccer_usa_mls',
  'mls-2027': 'soccer_usa_mls',
}

const ENTRIES: CalendarInput[] = [
  // ── NFL ─────────────────────────────────────────────────────────────────────
  {
    sport: 'nfl',
    competition: 'NFL Preseason 2026',
    competitionId: 'nfl-preseason-2026',
    phase: 'Preseason',
    startDate: '2026-08-07',
    endDate: '2026-08-28',
    autoCreate: false,
    autoResolve: true,
    notes: 'Preseason markets are off by default; enable manually per game',
  },
  {
    sport: 'nfl',
    competition: 'NFL Regular Season 2026–27',
    competitionId: 'nfl-regular-2026',
    phase: 'Regular Season',
    startDate: '2026-09-04',
    endDate: '2027-01-04',
    autoCreate: true,
    autoResolve: true,
    notes:
      'Rolling 14-day creation window; ~272 games total. Ties resolve at 50%.',
  },
  {
    sport: 'nfl',
    competition: 'NFL Playoffs 2027',
    competitionId: 'nfl-playoffs-2027',
    phase: 'Wild Card',
    startDate: '2027-01-10',
    endDate: '2027-01-11',
    autoCreate: true,
    autoResolve: true,
  },
  {
    sport: 'nfl',
    competition: 'NFL Playoffs 2027',
    competitionId: 'nfl-playoffs-2027',
    phase: 'Divisional Round',
    startDate: '2027-01-17',
    endDate: '2027-01-18',
    autoCreate: true,
    autoResolve: true,
  },
  {
    sport: 'nfl',
    competition: 'NFL Playoffs 2027',
    competitionId: 'nfl-playoffs-2027',
    phase: 'Conference Championships',
    startDate: '2027-01-24',
    endDate: '2027-01-24',
    autoCreate: true,
    autoResolve: true,
  },
  {
    sport: 'nfl',
    competition: 'NFL Playoffs 2027',
    competitionId: 'nfl-playoffs-2027',
    phase: 'Super Bowl LXI',
    startDate: '2027-02-01',
    endDate: '2027-02-01',
    autoCreate: true,
    autoResolve: true,
  },

  // ── College Football ─────────────────────────────────────────────────────────
  {
    sport: 'cfb',
    competition: 'NCAA Football 2026',
    competitionId: 'cfb-regular-2026',
    phase: 'Regular Season',
    startDate: '2026-08-29',
    endDate: '2026-11-28',
    autoCreate: true,
    autoResolve: true,
    notes:
      'Scope: Top 25 matchups and rivalry games only — not all games. Rolling 14-day window.',
  },
  {
    sport: 'cfb',
    competition: 'NCAA Football 2026',
    competitionId: 'cfb-regular-2026',
    phase: 'Conference Championships',
    startDate: '2026-12-05',
    endDate: '2026-12-06',
    autoCreate: true,
    autoResolve: true,
  },
  {
    sport: 'cfb',
    competition: 'NCAA Football 2026',
    competitionId: 'cfb-regular-2026',
    phase: 'Bowl Season',
    startDate: '2026-12-20',
    endDate: '2027-01-01',
    autoCreate: true,
    autoResolve: true,
  },
  {
    sport: 'cfb',
    competition: 'College Football Playoff 2026–27',
    competitionId: 'cfb-cfp-2027',
    phase: 'CFP (12-team)',
    startDate: '2026-12-20',
    endDate: '2027-01-19',
    autoCreate: true,
    autoResolve: true,
  },

  // ── F1 ──────────────────────────────────────────────────────────────────────
  {
    sport: 'f1',
    competition: 'F1 World Championship 2026',
    competitionId: 'f1-2026',
    phase: '2026 Remaining',
    startDate: '2026-08-28',
    endDate: '2026-12-07',
    autoCreate: true,
    autoResolve: true,
    notes:
      'Remaining races: Zandvoort, Monza, Singapore, Austin, Mexico City, São Paulo, Las Vegas, Abu Dhabi. DECISION NEEDED: one market per race weekend or separate markets per session (qualifying, sprint, race)?',
  },
  {
    sport: 'f1',
    competition: 'F1 World Championship 2027',
    competitionId: 'f1-2027',
    phase: '2027 Season',
    startDate: '2027-03-07',
    endDate: '2027-11-28',
    autoCreate: false,
    autoResolve: false,
    notes: 'Calendar TBC — hold auto-create until full race calendar confirmed',
  },

  // ── Tour de France ───────────────────────────────────────────────────────────
  {
    sport: 'tdf',
    competition: 'Tour de France 2027',
    competitionId: 'tdf-2027',
    phase: 'TdF 2027',
    startDate: '2027-07-03',
    endDate: '2027-07-25',
    autoCreate: false,
    autoResolve: false,
    notes:
      'DECISION NEEDED: per-stage markets (21 stages) vs. GC winner market only. Also consider: KoM / points jersey / best young rider classifications? Dates are estimates — confirm once official route announced.',
  },

  // ── Soccer: EPL ──────────────────────────────────────────────────────────────
  {
    sport: 'soccer',
    competition: 'English Premier League 2026–27',
    competitionId: 'epl-2026-27',
    phase: 'Season',
    startDate: '2026-08-15',
    endDate: '2027-05-17',
    autoCreate: true,
    autoResolve: true,
    notes: '~380 games total; rolling 14-day creation window',
  },

  // ── Soccer: Champions League ─────────────────────────────────────────────────
  {
    sport: 'soccer',
    competition: 'UEFA Champions League 2026–27',
    competitionId: 'ucl-2026-27',
    phase: 'League Phase',
    startDate: '2026-09-16',
    endDate: '2026-12-11',
    autoCreate: true,
    autoResolve: true,
  },
  {
    sport: 'soccer',
    competition: 'UEFA Champions League 2026–27',
    competitionId: 'ucl-2026-27',
    phase: 'Knockout Phase',
    startDate: '2027-02-11',
    endDate: '2027-05-30',
    autoCreate: true,
    autoResolve: true,
  },

  // ── Soccer: MLS ──────────────────────────────────────────────────────────────
  {
    sport: 'soccer',
    competition: 'MLS 2026',
    competitionId: 'mls-2026',
    phase: 'Regular Season',
    startDate: '2026-08-01',
    endDate: '2026-10-19',
    autoCreate: true,
    autoResolve: true,
    notes: 'Season wrapping up; rolling window already running',
  },
  {
    sport: 'soccer',
    competition: 'MLS 2026',
    competitionId: 'mls-2026',
    phase: 'MLS Cup Playoffs',
    startDate: '2026-10-22',
    endDate: '2026-11-28',
    autoCreate: true,
    autoResolve: true,
  },
  {
    sport: 'soccer',
    competition: 'MLS 2027',
    competitionId: 'mls-2027',
    phase: 'Season',
    startDate: '2027-02-27',
    endDate: '2027-11-27',
    autoCreate: false,
    autoResolve: false,
    notes: 'Enable auto-create once API provider confirmed',
  },

  // ── Soccer: NWSL ─────────────────────────────────────────────────────────────
  {
    sport: 'soccer',
    competition: 'NWSL 2026',
    competitionId: 'nwsl-2026',
    phase: 'Regular Season',
    startDate: '2026-08-01',
    endDate: '2026-10-11',
    autoCreate: true,
    autoResolve: true,
  },
  {
    sport: 'soccer',
    competition: 'NWSL 2026',
    competitionId: 'nwsl-2026',
    phase: 'Playoffs',
    startDate: '2026-10-16',
    endDate: '2026-11-15',
    autoCreate: true,
    autoResolve: true,
  },
  {
    sport: 'soccer',
    competition: 'NWSL 2027',
    competitionId: 'nwsl-2027',
    phase: 'Season',
    startDate: '2027-03-01',
    endDate: '2027-11-14',
    autoCreate: false,
    autoResolve: false,
    notes: 'Enable auto-create once API provider confirmed',
  },

  // ── MLB ──────────────────────────────────────────────────────────────────────
  {
    sport: 'mlb',
    competition: 'MLB 2026',
    competitionId: 'mlb-2026',
    phase: 'Playoffs',
    startDate: '2026-09-29',
    endDate: '2026-10-24',
    autoCreate: true,
    autoResolve: true,
  },
  {
    sport: 'mlb',
    competition: 'MLB 2026',
    competitionId: 'mlb-2026',
    phase: 'World Series',
    startDate: '2026-10-25',
    endDate: '2026-10-31',
    autoCreate: true,
    autoResolve: true,
  },
  {
    sport: 'mlb',
    competition: 'MLB 2027',
    competitionId: 'mlb-2027',
    phase: 'Regular Season',
    startDate: '2027-04-01',
    endDate: '2027-09-28',
    autoCreate: false,
    autoResolve: false,
    notes:
      '~162 games per team (~2430 total); rolling window essential. Enable once API confirmed.',
  },
  {
    sport: 'mlb',
    competition: 'MLB 2027',
    competitionId: 'mlb-2027',
    phase: 'Playoffs',
    startDate: '2027-09-30',
    endDate: '2027-10-25',
    autoCreate: false,
    autoResolve: false,
  },

  // ── NBA ──────────────────────────────────────────────────────────────────────
  {
    sport: 'nba',
    competition: 'NBA 2026–27',
    competitionId: 'nba-regular-2026-27',
    phase: 'Regular Season',
    startDate: '2026-10-21',
    endDate: '2027-04-12',
    autoCreate: true,
    autoResolve: true,
    notes:
      'Resolution-only live mode: final score triggers auto-resolve. Mid-game odds move via human traders only — no automated probability nudging during play.',
  },
  {
    sport: 'nba',
    competition: 'NBA Playoffs 2027',
    competitionId: 'nba-playoffs-2027',
    phase: 'Playoffs',
    startDate: '2027-04-18',
    endDate: '2027-06-15',
    autoCreate: true,
    autoResolve: true,
    notes: 'Resolution-only live mode',
  },

  // ── WNBA ─────────────────────────────────────────────────────────────────────
  {
    sport: 'wnba',
    competition: 'WNBA 2026',
    competitionId: 'wnba-2026',
    phase: 'Playoffs',
    startDate: '2026-09-17',
    endDate: '2026-10-20',
    autoCreate: true,
    autoResolve: true,
    notes: 'Resolution-only live mode',
  },
  {
    sport: 'wnba',
    competition: 'WNBA 2027',
    competitionId: 'wnba-2027',
    phase: 'Season',
    startDate: '2027-05-01',
    endDate: '2027-10-19',
    autoCreate: false,
    autoResolve: false,
    notes: 'Enable auto-create once API confirmed',
  },
]

export const SPORTS_CALENDAR: SportsCalendarEntry[] = ENTRIES.map((e) => ({
  ...e,
  oddsKey: ODDS_KEY_BY_COMPETITION[e.competitionId],
}))

export function calendarStatus(
  entry: Pick<SportsCalendarEntry, 'startDate' | 'endDate'>,
  now = Date.now()
): SportsCalendarStatus {
  const start = new Date(`${entry.startDate}T00:00:00Z`).getTime()
  const end = new Date(`${entry.endDate}T23:59:59Z`).getTime()
  if (end < now) return 'completed'
  if (start <= now) return 'active'
  return 'upcoming'
}

/** Entries whose window contains `now`. */
export function activeCalendarEntries(now = Date.now()): SportsCalendarEntry[] {
  return SPORTS_CALENDAR.filter((e) => calendarStatus(e, now) === 'active')
}

/** All phases of one competition. */
export function calendarEntriesFor(
  competitionId: string
): SportsCalendarEntry[] {
  return SPORTS_CALENDAR.filter((e) => e.competitionId === competitionId)
}

/** What goes in `sportsLeague`: the label the dashboards and the sport rail read. */
export const SPORT_LEAGUE_LABEL: Record<SportId, string> = {
  nfl: 'NFL',
  cfb: 'College Football',
  mlb: 'MLB',
  nba: 'NBA',
  wnba: 'WNBA',
  soccer: 'Soccer',
  f1: 'Formula 1',
  tdf: 'Tour de France',
}

/** Which chip on /sports a calendar sport belongs to. */
export const SPORT_ID_TO_SPORT_KEY: Record<SportId, SportKey> = {
  nfl: 'nfl',
  cfb: 'ncaaf',
  mlb: 'mlb',
  nba: 'nba',
  wnba: 'nba',
  soccer: 'soccer',
  f1: 'f1',
  tdf: 'other',
}

// Hours after the start before the market closes: the longest realistic game
// plus overtime for each sport.
export const CLOSE_BUFFER_HOURS: Record<SportId, number> = {
  nfl: 4,
  cfb: 4,
  mlb: 4,
  nba: 3,
  wnba: 3,
  soccer: 2.5,
  f1: 2,
  tdf: 1,
}
