import { groupBy } from 'lodash'
import { SPORT_LEAGUE_LABEL, SportId } from './sports-calendar'

// ─── How often the resolver asks for scores ───────────────────────────────────
//
// Two reasons to call /scores for a sport, set separately on /admin/sports:
// live scores while its games are on (per sport, with a per-game override for
// a big game), and finals once a game is due to end, so a game still resolves
// promptly with live scores off. One call covers every game of a sport key,
// so the fastest reason wins and the cost is per sport, not per game.
//
// The Odds API refreshes scores about every 30 seconds, so faster polling
// costs more and shows nothing new.

/** Live score speeds the panel offers, in seconds. 0 is off. */
export const LIVE_INTERVALS = [0, 300, 120, 60, 30] as const
/** Speeds for checking whether a game that's due to end has finished. */
export const FINALS_INTERVALS = [60, 300, 600] as const

export const DEFAULT_LIVE_INTERVAL = 300
export const DEFAULT_FINALS_INTERVAL = 300
/** A game still unresolved 3 hours after close is checked at most this often. */
export const OVERDUE_FINALS_INTERVAL = 30 * 60

/**
 * Minutes after kickoff when a game is due to end: the usual length with
 * breaks, a little early so the final is caught soon after the whistle.
 */
export const FINALS_FROM_MINUTES: Record<SportId, number> = {
  nfl: 180,
  cfb: 195,
  mlb: 150,
  nba: 130,
  wnba: 115,
  soccer: 105,
  nhl: 140,
  cbb: 115,
  f1: 90,
  tdf: 240,
}

/** The admin settings, from the sports_score_polling table. */
export interface ScorePollingSettings {
  /** Live interval per sport, in seconds; missing means the default. */
  sports: Partial<Record<SportId, number>>
  /** Live interval per game market, overriding its sport. */
  games: Record<string, number>
  finals: number
}

/** Row keys in sports_score_polling. */
export const pollingTarget = {
  sport: (sport: SportId) => `sport:${sport}`,
  game: (contractId: string) => `game:${contractId}`,
  finals: 'finals',
}

const SPORT_IDS = Object.keys(SPORT_LEAGUE_LABEL) as SportId[]

/** Why a setting can't be saved, or undefined when it can. */
export function pollingSettingError(
  target: string,
  intervalSeconds: number | null
): string | undefined {
  const [kind, id] = target.split(':')
  if (target === pollingTarget.finals) {
    if (intervalSeconds === null) return undefined
    return (FINALS_INTERVALS as readonly number[]).includes(intervalSeconds)
      ? undefined
      : `Finals checks run every ${FINALS_INTERVALS.join(', ')} seconds`
  }
  if (kind === 'sport' && !SPORT_IDS.includes(id as SportId))
    return `Unknown sport ${id}`
  if (kind === 'game' && !/^[A-Za-z0-9]{1,40}$/.test(id ?? ''))
    return `Bad market id ${id}`
  if (kind !== 'sport' && kind !== 'game') return `Unknown setting ${target}`
  if (intervalSeconds === null) return undefined
  return (LIVE_INTERVALS as readonly number[]).includes(intervalSeconds)
    ? undefined
    : `Live scores run every ${LIVE_INTERVALS.filter((i) => i).join(
        ', '
      )} seconds, or 0 for off`
}

export function parsePollingRows(
  rows: { target: string; intervalSeconds: number }[]
): ScorePollingSettings {
  const settings: ScorePollingSettings = {
    sports: {},
    games: {},
    finals: DEFAULT_FINALS_INTERVAL,
  }
  for (const { target, intervalSeconds } of rows) {
    if (pollingSettingError(target, intervalSeconds)) continue
    const [kind, id] = target.split(':')
    if (target === pollingTarget.finals) settings.finals = intervalSeconds
    else if (kind === 'sport') settings.sports[id as SportId] = intervalSeconds
    else if (kind === 'game') settings.games[id] = intervalSeconds
  }
  return settings
}

/** The sport behind a market's `sportsLeague` label. */
export const sportForLeague = (league: string | undefined) =>
  SPORT_IDS.find((id) => SPORT_LEAGUE_LABEL[id] === league)

export interface PollingGame {
  contractId: string
  /** The Odds API sport key; one /scores call per key. */
  sportKey: string
  sport: SportId | undefined
  startTime: number
  closeTime: number | undefined
}

/** A game's live score interval in seconds; 0 is off. */
export function liveInterval(
  game: Pick<PollingGame, 'contractId' | 'sport'>,
  settings: ScorePollingSettings
): number {
  return (
    settings.games[game.contractId] ??
    (game.sport ? settings.sports[game.sport] : undefined) ??
    DEFAULT_LIVE_INTERVAL
  )
}

/** Whether a game is due to have ended, so finals checks apply. */
export function finalsDue(
  game: Pick<PollingGame, 'sport' | 'startTime'>,
  now: number
): boolean {
  const minutes = game.sport
    ? FINALS_FROM_MINUTES[game.sport]
    : FINALS_FROM_MINUTES.soccer
  return now >= game.startTime + minutes * 60_000
}

const OVERDUE_AFTER_MS = 3 * 60 * 60 * 1000
// A tick that lands a moment early still counts as due.
const SLACK_MS = 5_000

/**
 * The sport keys to call /scores for on this tick, given when each was last
 * called. A key is due when the fastest reason among its started games has
 * come round: live scores for a game that wants them, or finals for a game
 * that's due to end (at most every half hour once it's 3 hours overdue).
 * `withFinished` asks for completed games too, which costs 2 credits instead
 * of 1, and is only needed once a game is due to end.
 */
export function scorePollPlan(
  games: PollingGame[],
  settings: ScorePollingSettings,
  lastPolled: Record<string, number>,
  now: number
): { sportKey: string; withFinished: boolean }[] {
  const plan: { sportKey: string; withFinished: boolean }[] = []
  for (const [sportKey, keyGames] of Object.entries(
    groupBy(games, (g) => g.sportKey)
  )) {
    const intervals: number[] = []
    let withFinished = false
    for (const game of keyGames) {
      const live = liveInterval(game, settings)
      if (live > 0) intervals.push(live)
      if (finalsDue(game, now)) {
        withFinished = true
        const overdue =
          game.closeTime !== undefined &&
          now - game.closeTime > OVERDUE_AFTER_MS
        intervals.push(
          overdue
            ? Math.max(settings.finals, OVERDUE_FINALS_INTERVAL)
            : settings.finals
        )
      }
    }
    if (intervals.length === 0) continue
    const interval = Math.min(...intervals) * 1000
    const since = now - (lastPolled[sportKey] ?? -Infinity)
    if (since + SLACK_MS < interval) continue
    plan.push({ sportKey, withFinished })
  }
  return plan
}

// ─── The panel on /admin/sports ───────────────────────────────────────────────

/** The Odds API's credits, from the headers of the calls we've recorded. */
export interface OddsApiUsageSummary {
  /** From the most recent call; null before any call is recorded. */
  used: number | null
  remaining: number | null
  asOf: number | null
  /** Credits per UTC day, oldest first, over the last 14 days. */
  byDay: { day: string; credits: number }[]
  /** Calls and credits per sport key over the last 7 days. */
  bySport: { sportKey: string; calls: number; credits: number }[]
}

export interface ScorePollingPanel {
  sports: {
    sport: SportId
    intervalSeconds: number
    isDefault: boolean
  }[]
  finals: { intervalSeconds: number; isDefault: boolean }
  /** Games on now or starting in the next 12 hours. */
  games: {
    contractId: string
    question: string
    slug: string
    sport: SportId | undefined
    startTime: number
    /** This game's own setting, or null when it follows its sport. */
    overrideSeconds: number | null
  }[]
  usage: OddsApiUsageSummary
}
