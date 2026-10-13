import { groupBy, sum } from 'lodash'
import { ENV } from './envs/constants'
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

/** Off on dev; dev games still resolve from the finals checks. */
export const DEFAULT_LIVE_INTERVAL = ENV === 'PROD' ? 300 : 0
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

/**
 * What the resolver falls back to when the admin's settings can't be read:
 * live scores off for every sport and finals at the default. Nothing an
 * admin switched off runs, and games still resolve.
 */
export function finalsOnlySettings(): ScorePollingSettings {
  return {
    sports: Object.fromEntries(SPORT_IDS.map((id) => [id, 0])) as Partial<
      Record<SportId, number>
    >,
    games: {},
    finals: DEFAULT_FINALS_INTERVAL,
  }
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
  /**
   * Absent from the last response (the provider only lists a completed game
   * when asked for finished ones, so it has probably ended, however early),
   * or completed but not resolvable yet. No live polls for it; its sport's
   * finals checks keep asking for finished games.
   */
  missing?: boolean
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
 * The sport keys to call /scores for on this tick. Two reasons to call, each
 * on its own clock:
 * - Live scores, for a game whose market is still open and that's still in
 *   the feed, at its live interval since the key's last call of any kind.
 * - Finals, for a game that's due to end or has gone missing from a
 *   live-only response, at the finals interval (at most every half hour once
 *   it's 3 hours overdue) since the key's last call that asked for finished
 *   games (`lastFinished`).
 * `withFinished` asks for completed games too, which costs 2 credits instead
 * of 1, so it's only set when a finals check is due: a game waiting on its
 * final doesn't double the cost of every live poll beside it. A key whose
 * calls keep failing waits twice as long per failure in a row, up to half an
 * hour, so a provider outage or an exhausted quota isn't called every
 * interval.
 */
export function scorePollPlan(
  games: PollingGame[],
  settings: ScorePollingSettings,
  lastPolled: Record<string, number>,
  now: number,
  failures: Record<string, number> = {},
  lastFinished: Record<string, number> = {}
): { sportKey: string; withFinished: boolean }[] {
  const plan: { sportKey: string; withFinished: boolean }[] = []
  for (const [sportKey, keyGames] of Object.entries(
    groupBy(games, (g) => g.sportKey)
  )) {
    const liveIntervals: number[] = []
    const finalsIntervals: number[] = []
    for (const game of keyGames) {
      const live = liveInterval(game, settings)
      // A closed market isn't traded and a missing game isn't in the feed:
      // live scores for either would only cost credits.
      const open = game.closeTime === undefined || now < game.closeTime
      if (live > 0 && open && !game.missing) liveIntervals.push(live)
      if (game.missing || finalsDue(game, now)) {
        const overdue =
          game.closeTime !== undefined &&
          now - game.closeTime > OVERDUE_AFTER_MS
        finalsIntervals.push(
          overdue
            ? Math.max(settings.finals, OVERDUE_FINALS_INTERVAL)
            : settings.finals
        )
      }
    }
    const fails = failures[sportKey] ?? 0
    // After a failed call, nothing goes out on either clock until the
    // backed-off wait since the last attempt has passed: a finals check
    // coming due mustn't slip through a live-poll cooldown, or the other
    // way round. lastPolled records every attempt, failed ones included.
    const intervals = [...liveIntervals, ...finalsIntervals]
    if (fails > 0 && intervals.length > 0) {
      const cooldown = backedOff(Math.min(...intervals), fails) * 1000
      if (now - (lastPolled[sportKey] ?? -Infinity) + SLACK_MS < cooldown)
        continue
    }
    const due = (intervals: number[], last: number | undefined) => {
      if (intervals.length === 0) return false
      const wait = backedOff(Math.min(...intervals), fails) * 1000
      return now - (last ?? -Infinity) + SLACK_MS >= wait
    }
    const finals = due(finalsIntervals, lastFinished[sportKey])
    // A call with finished games lists the live ones too, so it counts as
    // a live poll: lastPolled covers both kinds.
    const live = due(liveIntervals, lastPolled[sportKey])
    if (finals || live) plan.push({ sportKey, withFinished: finals })
  }
  return plan
}

/**
 * How long to wait after `failures` failed calls in a row: the interval,
 * doubled per failure, up to half an hour (or the interval, if longer).
 */
export function backedOff(intervalSeconds: number, failures: number): number {
  const cap = Math.max(intervalSeconds, OVERDUE_FINALS_INTERVAL)
  return Math.min(intervalSeconds * 2 ** Math.max(0, failures), cap)
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

const DAY_MS = 24 * 60 * 60 * 1000
const utcDay = (day: string) => Date.parse(`${day}T00:00:00Z`)

/**
 * What the last week cost per day, for how long the credits will last: the
 * full UTC days before today, back to the first recorded call or seven
 * days, whichever is nearer, so a quiet day in a week of history counts as
 * a day of nothing but a history that began two days ago is averaged over
 * two. Today is a partial day, so it's reported on its own, not averaged.
 */
export function creditsPerDay(
  byDay: { day: string; credits: number }[],
  now: number
): { perDay: number; days: number; today: number } {
  const today = Math.floor(now / DAY_MS) * DAY_MS
  const credits = (rows: { credits: number }[]) =>
    sum(rows.map((d) => d.credits))
  const todayCredits = credits(byDay.filter((d) => utcDay(d.day) === today))
  const before = byDay.filter((d) => utcDay(d.day) < today)
  if (before.length === 0) return { perDay: 0, days: 0, today: todayCredits }
  const from = Math.max(
    today - 7 * DAY_MS,
    Math.min(...before.map((d) => utcDay(d.day)))
  )
  const days = Math.max(1, Math.round((today - from) / DAY_MS))
  return {
    perDay: credits(before.filter((d) => utcDay(d.day) >= from)) / days,
    days,
    today: todayCredits,
  }
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
