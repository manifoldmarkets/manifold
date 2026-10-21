import type { SportId, SportsCalendarEntry } from './sports-calendar'

/** Scores coverage checked against the provider catalogue on 22 October 2026.
 * https://the-odds-api.com/sports-odds-data/sports-apis.html
 * Odds-only feeds must not enter the automatic settlement pipeline.
 */
export interface SportsFeed {
  key: string
  label: string
  sport: SportId
  region: 'us' | 'uk' | 'eu' | 'au'
  priority: 1 | 2 | 3
  locked?: string
  /** Restrict a mixed league/knockout feed to a verified league phase. */
  leaguePhaseEnd?: string
}

const KNOCKOUT =
  'Confirm regular-season windows or implement regulation-time scores: this feed can include extra time or penalties'
const TENNIS =
  'Validate sets, retirements and walkovers before enabling automatic tennis settlement'
const RULES =
  'Validate draw, overtime and postseason settlement against completed provider fixtures'

const feeds = (
  sport: SportId,
  region: SportsFeed['region'],
  priority: SportsFeed['priority'],
  rows: [key: string, label: string][],
  locked?: string,
  leaguePhaseEnd?: string
): SportsFeed[] =>
  rows.map(([key, label]) => ({
    key,
    label,
    sport,
    region,
    priority,
    locked,
    leaguePhaseEnd,
  }))

/** Additions to the season-specific calendar. All start off for an admin dry run. */
export const ADDITIONAL_SPORTS_FEEDS: SportsFeed[] = [
  ...feeds('cfb', 'us', 2, [['americanfootball_ncaaf_fcs', 'NCAAF FCS']]),
  ...feeds('football', 'us', 2, [
    ['americanfootball_cfl', 'CFL'],
    ['americanfootball_ufl', 'UFL'],
  ]),
  ...feeds('basketball', 'eu', 2, [['basketball_euroleague', 'EuroLeague']]),
  ...feeds('basketball', 'au', 2, [['basketball_nbl', 'NBL Australia']]),
  ...feeds('wcbb', 'us', 1, [['basketball_wncaab', 'WNCAAB']]),
  ...feeds('nba', 'us', 3, [
    ['basketball_nba_preseason', 'NBA Preseason'],
    ['basketball_nba_summer_league', 'NBA Summer League'],
  ]),
  ...feeds('mlb', 'us', 3, [['baseball_mlb_preseason', 'MLB Preseason']]),
  ...feeds('nhl', 'us', 3, [['icehockey_nhl_preseason', 'NHL Preseason']]),
  ...feeds('hockey', 'eu', 3, [
    ['icehockey_sweden_hockey_league', 'SHL'],
    ['icehockey_sweden_allsvenskan', 'HockeyAllsvenskan'],
  ]),
  ...feeds('afl', 'au', 2, [['aussierules_afl', 'AFL']]),
  ...feeds('nrl', 'au', 2, [['rugbyleague_nrl', 'NRL']]),
  ...feeds(
    'handball',
    'eu',
    3,
    [['handball_germany_bundesliga', 'Handball Bundesliga']],
    RULES
  ),
  ...feeds(
    'soccer',
    'uk',
    2,
    [
      ['soccer_efl_champ', 'EFL Championship'],
      ['soccer_spl', 'Scottish Premiership'],
    ],
    KNOCKOUT
  ),
  ...feeds('soccer', 'eu', 2, [
    ['soccer_portugal_primeira_liga', 'Primeira Liga'],
    ['soccer_turkey_super_league', 'Süper Lig'],
    ['soccer_brazil_campeonato', 'Brazil Série A'],
    ['soccer_saudi_arabia_pro_league', 'Saudi Pro League'],
    ['soccer_germany_bundesliga_women', 'Frauen-Bundesliga'],
  ]),
  ...feeds(
    'soccer',
    'eu',
    2,
    [
      ['soccer_netherlands_eredivisie', 'Eredivisie'],
      ['soccer_mexico_ligamx', 'Liga MX'],
      ['soccer_argentina_primera_division', 'Argentina Primera División'],
    ],
    KNOCKOUT
  ),
  ...feeds(
    'soccer',
    'au',
    2,
    [['soccer_australia_aleague', 'A-League']],
    KNOCKOUT
  ),
  ...feeds('soccer', 'eu', 3, [
    ['soccer_brazil_serie_b', 'Brazil Série B'],
    ['soccer_chile_campeonato', 'Chile Primera División'],
    ['soccer_china_superleague', 'Chinese Super League'],
    ['soccer_league_of_ireland', 'League of Ireland'],
    ['soccer_poland_ekstraklasa', 'Ekstraklasa'],
    ['soccer_sweden_allsvenskan', 'Allsvenskan'],
    ['soccer_germany_liga3', '3. Liga'],
  ]),
  ...feeds(
    'soccer',
    'eu',
    3,
    [
      ['soccer_sweden_superettan', 'Superettan'],
      ['soccer_austria_bundesliga', 'Austrian Bundesliga'],
      ['soccer_belgium_first_div', 'Belgian First Division'],
      ['soccer_denmark_superliga', 'Danish Superliga'],
      ['soccer_finland_veikkausliiga', 'Veikkausliiga'],
      ['soccer_france_ligue_two', 'Ligue 2'],
      ['soccer_germany_bundesliga2', '2. Bundesliga'],
      ['soccer_greece_super_league', 'Greek Super League'],
      ['soccer_italy_serie_b', 'Serie B'],
      ['soccer_japan_j_league', 'J League'],
      ['soccer_korea_kleague1', 'K League 1'],
      ['soccer_norway_eliteserien', 'Eliteserien'],
      ['soccer_russia_premier_league', 'Russian Premier League'],
      ['soccer_spain_segunda_division', 'La Liga 2'],
      ['soccer_switzerland_superleague', 'Swiss Super League'],
    ],
    KNOCKOUT
  ),
  ...feeds(
    'soccer',
    'uk',
    3,
    [
      ['soccer_england_league1', 'EFL League One'],
      ['soccer_england_league2', 'EFL League Two'],
    ],
    KNOCKOUT
  ),
  // Operational league-phase windows end before knockout rounds; do not extend
  // them into the knockouts without regulation-time score support.
  ...feeds(
    'soccer',
    'eu',
    1,
    [['soccer_uefa_europa_league', 'Europa League']],
    undefined,
    '2027-01-28'
  ),
  ...feeds(
    'soccer',
    'eu',
    2,
    [['soccer_uefa_europa_conference_league', 'Conference League']],
    undefined,
    '2026-12-17'
  ),
  ...feeds(
    'soccer',
    'eu',
    2,
    [
      ['soccer_uefa_champs_league_women', "Women's Champions League"],
      [
        'soccer_uefa_champs_league_qualification',
        'Champions League Qualifying',
      ],
      ['soccer_fa_cup', 'FA Cup'],
      ['soccer_england_efl_cup', 'EFL Cup'],
      ['soccer_france_coupe_de_france', 'Coupe de France'],
      ['soccer_germany_dfb_pokal', 'DFB-Pokal'],
      ['soccer_italy_coppa_italia', 'Coppa Italia'],
      ['soccer_spain_copa_del_rey', 'Copa del Rey'],
      ['soccer_fifa_world_cup', 'FIFA World Cup'],
      ['soccer_fifa_world_cup_womens', "FIFA Women's World Cup"],
      ['soccer_fifa_club_world_cup', 'FIFA Club World Cup'],
      [
        'soccer_fifa_world_cup_qualifiers_europe',
        'World Cup Qualifying Europe',
      ],
      [
        'soccer_fifa_world_cup_qualifiers_south_america',
        'World Cup Qualifying South America',
      ],
      ['soccer_uefa_european_championship', 'UEFA Euros'],
      ['soccer_uefa_euro_qualification', 'Euro Qualifying'],
      ['soccer_uefa_nations_league', 'Nations League'],
      ['soccer_concacaf_leagues_cup', 'Leagues Cup'],
      ['soccer_conmebol_copa_america', 'Copa América'],
      ['soccer_conmebol_copa_libertadores', 'Copa Libertadores'],
      ['soccer_conmebol_copa_sudamericana', 'Copa Sudamericana'],
    ],
    KNOCKOUT
  ),
  ...feeds(
    'tennis',
    'us',
    2,
    [
      ['tennis_atp_canadian_open', 'ATP Canadian Open'],
      ['tennis_atp_china_open', 'ATP China Open'],
      ['tennis_atp_cincinnati_open', 'ATP Cincinnati Open'],
      ['tennis_atp_japan_open', 'ATP Japan Open'],
      ['tennis_atp_shanghai_masters', 'ATP Shanghai Masters'],
      ['tennis_atp_us_open', 'ATP US Open'],
      ['tennis_atp_washington_open', 'ATP Washington Open'],
      ['tennis_wta_canadian_open', 'WTA Canadian Open'],
      ['tennis_wta_china_open', 'WTA China Open'],
      ['tennis_wta_cincinnati_open', 'WTA Cincinnati Open'],
      ['tennis_wta_guadalajara_open', 'WTA Guadalajara Open'],
      ['tennis_wta_monterrey_open', 'WTA Monterrey Open'],
      ['tennis_wta_singapore_open', 'WTA Singapore Open'],
      ['tennis_wta_us_open', 'WTA US Open'],
      ['tennis_wta_washington_open', 'WTA Washington Open'],
      ['tennis_wta_wuhan_open', 'WTA Wuhan Open'],
    ],
    TENNIS
  ),
]

export const ADDITIONAL_FEED_BY_KEY: Record<string, SportsFeed> =
  Object.fromEntries(ADDITIONAL_SPORTS_FEEDS.map((f) => [f.key, f]))

/** Operational coverage window, not a claim about a league's season dates.
 * The API supplies actual fixture times. Renew/review this window annually.
 */
export const additionalFeedCalendar = (): SportsCalendarEntry[] =>
  ADDITIONAL_SPORTS_FEEDS.map((feed) => ({
    sport: feed.sport,
    competition: feed.label,
    competitionId: `feed-${feed.key}`,
    phase: feed.leaguePhaseEnd ? 'League Phase' : 'Feed coverage',
    startDate: '2026-10-22',
    endDate: feed.leaguePhaseEnd ?? '2027-10-21',
    oddsKey: feed.key,
    autoCreate: false,
    autoResolve: !feed.locked,
    locked: feed.locked,
    notes: `Priority ${feed.priority}. ${
      feed.locked
        ? 'Requires settlement validation.'
        : 'Ready for a fixture dry run; enable in stages.'
    } Uses ${feed.region.toUpperCase()} bookmakers. ${
      feed.leaguePhaseEnd
        ? 'League phase only; knockout games are excluded.'
        : 'Dates are an operational coverage window, not season dates.'
    }`,
  }))
