import {
  CLOSE_BUFFER_HOURS,
  SPORT_LEAGUE_LABEL,
  SportsCalendarEntry,
} from './sports-calendar'

// ─── The Odds API: pure helpers ───────────────────────────────────────────────
//
// Everything about an Odds API game market that does not need the network or
// the database: the response shapes, the odds maths, the event id format, and
// the market a game turns into. The backend does the fetching and inserting.

export interface OddsApiEvent {
  id: string
  sport_key: string
  sport_title: string
  /** ISO 8601 */
  commence_time: string
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
  /** American odds, e.g. -150 or +130 */
  price: number
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

// ─── Event ids ────────────────────────────────────────────────────────────────
//
// `sportsEventId` on a contract is `odds:<sport key>:<event id>`, so the
// resolver can tell which sport to poll from the field alone and every market
// about the game (lines, props) can carry the same id.

const ODDS_EVENT_PREFIX = 'odds:'

export function oddsEventId(sportKey: string, eventId: string): string {
  return `${ODDS_EVENT_PREFIX}${sportKey}:${eventId}`
}

export function parseOddsEventId(
  id: string | null | undefined
): { sportKey: string; eventId: string } | null {
  if (!id || !id.startsWith(ODDS_EVENT_PREFIX)) return null
  const rest = id.slice(ODDS_EVENT_PREFIX.length)
  const i = rest.indexOf(':')
  if (i <= 0 || i === rest.length - 1) return null
  return { sportKey: rest.slice(0, i), eventId: rest.slice(i + 1) }
}

// ─── Odds maths ───────────────────────────────────────────────────────────────

/** American odds to raw implied probability (before removing the vig). */
export function americanOddsToProb(price: number): number {
  if (price > 0) return 100 / (price + 100)
  return Math.abs(price) / (Math.abs(price) + 100)
}

/**
 * Fair probability that `teamName` wins, averaged over every bookmaker's
 * h2h market and devigged by that market's overround. Works for three-way
 * soccer markets too ("Draw" is an outcome name). Null without h2h data.
 */
export function fairWinProb(
  event: OddsApiEvent,
  teamName: string
): number | null {
  const h2h = event.bookmakers.flatMap((b) =>
    b.markets.filter((m) => m.key === 'h2h')
  )
  const perBook = h2h.flatMap((market) => {
    const outcome = market.outcomes.find((o) => o.name === teamName)
    if (!outcome) return []
    const teamRaw = americanOddsToProb(outcome.price)
    const totalRaw = market.outcomes.reduce(
      (s, o) => s + americanOddsToProb(o.price),
      0
    )
    return totalRaw > 0 ? [teamRaw / totalRaw] : []
  })
  if (perBook.length === 0) return null
  const avg = perBook.reduce((s, p) => s + p, 0) / perBook.length
  return Math.min(0.99, Math.max(0.01, avg))
}

/** The winning team's name from a completed score, or null for a tie or no data. */
export function resolveWinner(score: OddsApiScore): string | null {
  if (!score.completed || !score.scores || score.scores.length < 2) return null
  const [a, b] = score.scores
  const scoreA = parseInt(a.score, 10)
  const scoreB = parseInt(b.score, 10)
  if (isNaN(scoreA) || isNaN(scoreB)) return null
  if (scoreA === scoreB) return null
  return scoreA > scoreB ? a.name : b.name
}

/** Home and away scores from a score payload, matched by team name. */
export function teamScores(score: OddsApiScore): {
  home: number | null
  away: number | null
} {
  const find = (name: string) => {
    const raw = score.scores?.find((s) => s.name === name)?.score
    const n = raw == null ? NaN : parseInt(raw, 10)
    return isNaN(n) ? null : n
  }
  return { home: find(score.home_team), away: find(score.away_team) }
}

// ─── The market a game becomes ────────────────────────────────────────────────

export const DRAW_ANSWER = 'Draw'

/** Soccer draws are common enough to deserve their own answer; elsewhere a tie is a 50% resolution. */
export function isThreeWay(
  entry: Pick<SportsCalendarEntry, 'sport' | 'tiesAllowed'>
): boolean {
  return entry.tiesAllowed ?? entry.sport === 'soccer'
}

export interface OddsMarketParams {
  outcomeType: 'BINARY' | 'MULTIPLE_CHOICE'
  question: string
  /** Markdown */
  description: string
  /** Binary: home-win probability as a percentage. Three-way: unused (answers start level). */
  initialProb: number
  /** Three-way only: home, away, Draw. */
  answers?: string[]
  closeTime: number
  sportsEventId: string
  sportsStartTimestamp: string
  sportsLeague: string
  sportsHomeTeam: string
  sportsAwayTeam: string
  sportsMarketType: 'moneyline'
}

export function buildOddsMarketParams(
  event: OddsApiEvent,
  entry: Pick<SportsCalendarEntry, 'sport' | 'competition' | 'tiesAllowed'>
): OddsMarketParams {
  const threeWay = isThreeWay(entry)
  const date = new Date(event.commence_time).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  })
  const home = event.home_team
  const away = event.away_team
  const homeProb = fairWinProb(event, home)
  const initialProb = homeProb !== null ? Math.round(homeProb * 100) : 50
  const seeded =
    homeProb !== null
      ? `Opening probability seeded from the bookmakers' moneyline.`
      : `Opening probability 50%: no moneyline was available at creation.`

  const question = threeWay
    ? `${home} vs ${away} [${entry.competition}, ${date}]`
    : `${away} at ${home} [${entry.competition}, ${date}]`

  const description = threeWay
    ? [
        `**${home}** vs **${away}**`,
        ``,
        `Resolves to the team that wins, or to Draw if the match ends level after any extra time and penalties that count for the competition.`,
        `Resolves N/A if the match is cancelled or postponed indefinitely.`,
        ``,
        `Created and resolved automatically by @ManifoldSports.`,
      ].join('\n')
    : [
        `**${away}** at **${home}**`,
        ``,
        `Resolves YES if ${home} wins and NO if ${away} wins.`,
        `If the game ends in a tie, resolves at 50% (both sides get half their winnings).`,
        `Resolves N/A if the game is cancelled or postponed indefinitely.`,
        ``,
        `${seeded} Created and resolved automatically by @ManifoldSports.`,
      ].join('\n')

  const closeTime =
    new Date(event.commence_time).getTime() +
    CLOSE_BUFFER_HOURS[entry.sport] * 60 * 60 * 1000

  return {
    outcomeType: threeWay ? 'MULTIPLE_CHOICE' : 'BINARY',
    question,
    description,
    initialProb: Math.min(99, Math.max(1, initialProb)),
    answers: threeWay ? [home, away, DRAW_ANSWER] : undefined,
    closeTime,
    sportsEventId: oddsEventId(event.sport_key, event.id),
    sportsStartTimestamp: event.commence_time,
    sportsLeague: SPORT_LEAGUE_LABEL[entry.sport],
    sportsHomeTeam: home,
    sportsAwayTeam: away,
    sportsMarketType: 'moneyline',
  }
}
