/**
 * Typed client for The Odds API (api.the-odds-api.com).
 * Handles two use cases:
 *   1. Seeding initial market probability from Vegas moneyline odds at creation time.
 *   2. Polling /scores to detect completed games for auto-resolution.
 *
 * API key is read from THE_ODDS_API_KEY env var.
 * Docs: https://the-odds-api.com/liveapi/guides/v4/
 */

import { log } from 'shared/utils'
import { SportsCalendarEntry } from 'common/sports'

const BASE_URL = 'https://api.the-odds-api.com/v4'

// Maps our competitionId slugs to The Odds API sport keys.
// F1 and TdF are intentionally omitted — their coverage is insufficient for
// score-based resolution; those sports will use manual resolution for now.
export const COMPETITION_TO_ODDS_KEY: Record<string, string> = {
  // NFL
  'nfl-preseason-2026': 'americanfootball_nfl_preseason',
  'nfl-regular-2026': 'americanfootball_nfl',
  'nfl-playoffs-2027': 'americanfootball_nfl',
  // College Football
  'cfb-regular-2026': 'americanfootball_ncaaf',
  'cfb-cfp-2027': 'americanfootball_ncaaf',
  // MLB
  'mlb-2026': 'baseball_mlb',
  'mlb-2027': 'baseball_mlb',
  // NBA
  'nba-regular-2026-27': 'basketball_nba',
  'nba-playoffs-2027': 'basketball_nba',
  // WNBA
  'wnba-2026': 'basketball_wnba',
  'wnba-2027': 'basketball_wnba',
  // Soccer
  'epl-2026-27': 'soccer_epl',
  // UCL: not in The Odds API catalog as of Aug 2026 — may appear when the
  // 2026-27 season opens in September. Re-check then; UCL resolves via
  // football-data.org in the meantime.
  'mls-2026': 'soccer_usa_mls',
  'mls-2027': 'soccer_usa_mls',
  // NWSL: not in The Odds API catalog — no coverage on this provider.
  // Resolution will require a separate data source or manual admin action.
}

// ─── Response types ───────────────────────────────────────────────────────────

export interface OddsApiEvent {
  id: string
  sport_key: string
  sport_title: string
  commence_time: string // ISO 8601
  home_team: string
  away_team: string
  bookmakers: OddsApiBookmaker[]
}

export interface OddsApiBookmaker {
  key: string
  title: string
  last_update: string
  markets: OddsApiMarket[]
}

export interface OddsApiMarket {
  key: 'h2h' | 'spreads' | 'totals'
  last_update: string
  outcomes: OddsApiOutcome[]
}

export interface OddsApiOutcome {
  name: string
  price: number // American odds (e.g. -150, +130)
}

export interface OddsApiScore {
  id: string
  sport_key: string
  sport_title: string
  commence_time: string
  completed: boolean
  home_team: string
  away_team: string
  scores: Array<{ name: string; score: string }> | null
  last_update: string | null
}

// ─── Probability helpers ──────────────────────────────────────────────────────

/** Convert American odds to implied (raw) probability. */
export function americanOddsToProb(price: number): number {
  if (price > 0) return 100 / (price + 100)
  return Math.abs(price) / (Math.abs(price) + 100)
}

/**
 * Return a devigged fair-probability for `teamName` winning, averaging across
 * all bookmakers' h2h markets. Returns null if no h2h data is available.
 */
export function fairWinProb(
  event: OddsApiEvent,
  teamName: string
): number | null {
  const h2hMarkets = event.bookmakers
    .flatMap((b) => b.markets.filter((m) => m.key === 'h2h'))

  if (h2hMarkets.length === 0) return null

  // Per-bookmaker: raw implied prob for teamName, total implied prob across all outcomes
  const perBook = h2hMarkets.flatMap((market) => {
    const outcome = market.outcomes.find((o) => o.name === teamName)
    if (!outcome) return []
    const teamRaw = americanOddsToProb(outcome.price)
    const totalRaw = market.outcomes.reduce(
      (s, o) => s + americanOddsToProb(o.price),
      0
    )
    return [{ teamRaw, totalRaw }]
  })

  if (perBook.length === 0) return null

  const avgTeam = perBook.reduce((s, b) => s + b.teamRaw, 0) / perBook.length
  const avgTotal = perBook.reduce((s, b) => s + b.totalRaw, 0) / perBook.length

  // Devig: normalize by the average overround
  return avgTotal > 0 ? Math.min(0.99, Math.max(0.01, avgTeam / avgTotal)) : null
}

// ─── API calls ────────────────────────────────────────────────────────────────

function apiKey(): string {
  const key = process.env.THE_ODDS_API_KEY ?? ''
  if (!key) throw new Error('THE_ODDS_API_KEY env var is not set')
  return key
}

/**
 * Fetch upcoming events + h2h odds for a sport.
 * `daysAhead` limits results to games commencing within that window.
 */
export async function getUpcomingOdds(
  sportKey: string,
  daysAhead = 14
): Promise<OddsApiEvent[]> {
  const commenceTimeTo = new Date(
    Date.now() + daysAhead * 24 * 60 * 60 * 1000
  ).toISOString()

  const url = new URL(`${BASE_URL}/sports/${sportKey}/odds`)
  url.searchParams.set('apiKey', apiKey())
  url.searchParams.set('regions', 'us')
  url.searchParams.set('markets', 'h2h')
  url.searchParams.set('oddsFormat', 'american')
  url.searchParams.set('commenceTimeTo', commenceTimeTo)

  const res = await fetch(url.toString())
  if (!res.ok) {
    throw new Error(
      `Odds API /odds error for ${sportKey}: ${res.status} ${res.statusText}`
    )
  }

  const remaining = res.headers.get('x-requests-remaining')
  if (remaining !== null && parseInt(remaining) < 50) {
    log(
      `[the-odds-api] WARNING: only ${remaining} requests remaining this month`
    )
  }

  return res.json()
}

/**
 * Fetch recent + live scores for a sport.
 * `daysBack` includes completed games from the past N days (max 3 on free tier).
 */
export async function getScores(
  sportKey: string,
  daysBack = 1
): Promise<OddsApiScore[]> {
  const url = new URL(`${BASE_URL}/sports/${sportKey}/scores`)
  url.searchParams.set('apiKey', apiKey())
  url.searchParams.set('daysFrom', String(daysBack))

  const res = await fetch(url.toString())
  if (!res.ok) {
    throw new Error(
      `Odds API /scores error for ${sportKey}: ${res.status} ${res.statusText}`
    )
  }

  return res.json()
}

/**
 * Given a completed OddsApiScore, return the winning team name.
 * Returns null if the game isn't completed or scores are unavailable.
 */
export function resolveWinner(score: OddsApiScore): string | null {
  if (!score.completed || !score.scores || score.scores.length < 2) return null

  const [a, b] = score.scores
  const scoreA = parseInt(a.score, 10)
  const scoreB = parseInt(b.score, 10)

  if (isNaN(scoreA) || isNaN(scoreB)) return null
  if (scoreA === scoreB) return null // draw — caller handles this

  return scoreA > scoreB ? a.name : b.name
}

/**
 * Return the Odds API sport key for a calendar entry, or null if unsupported.
 */
export function oddsKeyForEntry(
  entry: Pick<SportsCalendarEntry, 'competitionId'>
): string | null {
  return COMPETITION_TO_ODDS_KEY[entry.competitionId] ?? null
}
