import { ADDITIONAL_SPORTS_FEEDS } from './sports-feeds'
import { parseOddsEventId } from './odds-markets'
import { MANIFOLD_SPORTS_USER_IDS, WORLD_CUP_2026 } from './sports'

// The short league label an official game market shows in front of its
// title ("NFL Seahawks at Broncos, Oct 15"), the way a perp shows its ticker.
// It replaces the "[official]" the pipeline used to put in the title.

/** By The Odds API sport key, for markets the Odds API pipeline made. */
const LABEL_BY_ODDS_KEY: Record<string, string> = {
  ...Object.fromEntries(
    ADDITIONAL_SPORTS_FEEDS.map((f) => [f.key, f.shortLabel])
  ),
  americanfootball_nfl: 'NFL',
  americanfootball_nfl_preseason: 'NFL',
  // What the /sports chip calls it.
  americanfootball_ncaaf: 'NCAAF',
  baseball_mlb: 'MLB',
  basketball_nba: 'NBA',
  basketball_wnba: 'WNBA',
  basketball_ncaab: 'NCAAB',
  icehockey_nhl: 'NHL',
  soccer_epl: 'EPL',
  soccer_usa_mls: 'MLS',
  soccer_uefa_champs_league: 'UCL',
  soccer_spain_la_liga: 'LA LIGA',
  soccer_italy_serie_a: 'SERIE A',
  soccer_germany_bundesliga: 'BUNDESLIGA',
  soccer_france_ligue_one: 'LIGUE 1',
}

/**
 * By `sportsLeague`, for the older football-data markets. That pipeline only
 * ran the 2026 World Cup; a later one comes through the Odds API keys above.
 */
const LABEL_BY_LEAGUE: Record<string, string> = {
  [WORLD_CUP_2026.sportsLeague]: 'WC26',
}

/** Exported for the test that keeps it in step with the calendar. */
export const LEAGUE_LABEL_ODDS_KEYS = Object.keys(LABEL_BY_ODDS_KEY)

/**
 * The league label for an official game market, or undefined for anything
 * else. Only markets @ManifoldSports created count: anyone can set the sports
 * fields on a market they make, and the label vouches for the market.
 */
export function getSportsLeagueLabel(contract: {
  creatorId: string
  sportsEventId?: string
  sportsLeague?: string
}): string | undefined {
  if (!MANIFOLD_SPORTS_USER_IDS.includes(contract.creatorId)) return undefined
  const { sportsEventId, sportsLeague } = contract
  if (!sportsEventId) return undefined
  const odds = parseOddsEventId(sportsEventId)
  if (odds) return LABEL_BY_ODDS_KEY[odds.sportKey]
  return sportsLeague ? LABEL_BY_LEAGUE[sportsLeague] : undefined
}

/** What the old pipeline appended to every game market's title. */
export const LEGACY_OFFICIAL_SUFFIX = ' [official]'
