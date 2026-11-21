import { isSportsBdlEnabled } from './bdl/rollout'
import { z } from 'zod'
import type { ScheduleGame } from './sports-schedule'

const count = z.number().int().nonnegative().finite()
const pair = z.object({ home: count.nullable(), away: count.nullable() })
const period = z.union([
  count.max(99),
  z
    .string()
    .regex(
      /^(?:[QPH]\d{1,2}|\d{1,2}[HP]|\d{1,2}(?:st|nd|rd|th)?(?: (?:quarter|period|inning|half))?|(?:top|bot|bottom|mid|end) \d{1,2}(?:st|nd|rd|th)?|(?:\d{1,2})?OT|SO|AET|PEN|HT|FT)$/i
    ),
])
const clock = z
  .string()
  .regex(/^(?:\d{1,3}:\d{2}(?:\.\d{1,2})?|\d{1,2}\.\d{1,2})$/)
const qualifier = z.enum(['OT', 'SO', 'AET', 'PEN'])
const time = z.number().finite().nonnegative().max(8.64e15)
export type SportsFinalQualifier = z.infer<typeof qualifier>

const seasonCount = count.max(1000)
const standing = z
  .object({
    wins: seasonCount,
    losses: seasonCount,
    overtimeLosses: seasonCount.optional().catch(undefined),
    ties: seasonCount.optional().catch(undefined),
    rank: seasonCount.min(1).optional().catch(undefined),
  })
  .transform(({ wins, losses, ties, rank, overtimeLosses }) => ({
    wins,
    losses,
    ...(ties !== undefined && { ties }),
    ...(overtimeLosses !== undefined && { overtimeLosses }),
    ...(rank !== undefined && { rank }),
  }))
const teamStanding = standing.optional().catch(undefined)
const standings = z
  .object({ home: teamStanding, away: teamStanding })
  .transform(({ home, away }) =>
    home || away ? { ...(home && { home }), ...(away && { away }) } : undefined
  )
  .optional()
  .catch(undefined)

// A provider detail object can contain internal notes and raw data. Only these
// keys (including the keys on each nested score) may leave the score pipeline.
const detail = z
  .object({
    periodScores: z.array(pair).max(32).optional(),
    shots: pair.optional(),
    inningHalf: z.enum(['top', 'bottom']).optional(),
    bases: z.tuple([z.boolean(), z.boolean(), z.boolean()]).optional(),
    outs: count.max(3).optional(),
    down: count.min(1).max(4).optional(),
    yardsToGo: count.max(100).optional(),
    redCards: pair.optional(),
    standings,
  })
  .transform(({ standings: teams, ...rest }) => ({
    ...rest,
    ...(teams && { standings: teams }),
  }))
export type SportsScoreboard = z.infer<typeof detail>
export type SportsGameState =
  | 'scheduled'
  | 'live'
  | 'delayed'
  | 'postponed'
  | 'suspended'
  | 'settling'
  | 'final'
  | 'canceled'
  | 'unavailable'

const liveStatus = z.enum([
  'IN_PLAY',
  'PAUSED',
  'FINISHED',
  'AWARDED',
  'SCHEDULED',
  'IN_PROGRESS',
  'DELAYED',
  'POSTPONED',
  'SUSPENDED',
  'FINAL',
  'CANCELED',
  'UNKNOWN',
  'ABANDONED',
  'scheduled',
  'in_progress',
  'delayed',
  'postponed',
  'suspended',
  'final',
  'canceled',
  'unknown',
  'abandoned',
])
export const publicSportsScoreSchema = z.object({
  sportsHomeScore: z.number().finite().nonnegative().nullable(),
  sportsAwayScore: z.number().finite().nonnegative().nullable(),
  sportsLiveStatus: z.preprocess(
    (value) =>
      typeof value === 'string' && /^(?:needs[-_ ]attention)$/i.test(value)
        ? 'UNKNOWN'
        : value,
    liveStatus
  ),
  sportsLiveMinute: z.string().nullable(),
  sportsLiveUpdatedTime: z.number().finite(),
  sportsScoreUpdatedTime: z.number().finite().nullable().optional(),
  sportsLivePeriod: period.nullable().optional(),
  sportsLiveClock: clock.nullable().optional(),
  sportsLiveDetail: detail.nullable().optional(),
  sportsResumptionTime: time.nullable().optional(),
  sportsFinalQualifier: qualifier.nullable().optional(),
})

export const legacySportsScoreSchema = publicSportsScoreSchema
  .pick({
    sportsHomeScore: true,
    sportsAwayScore: true,
    sportsLiveMinute: true,
    sportsLiveUpdatedTime: true,
    sportsScoreUpdatedTime: true,
  })
  .extend({
    sportsLiveStatus: z.enum(['IN_PLAY', 'PAUSED', 'FINISHED', 'AWARDED']),
  })

/** The API and publisher expose the same score protocol for this deployment. */
export const rolloutSportsScoreSchema = z.lazy(() =>
  isSportsBdlEnabled() ? publicSportsScoreSchema : legacySportsScoreSchema
)

export type ScheduleScoreFields = {
  gameState?: SportsGameState
  period?: number | string
  clock?: string
  resumptionTime?: number
  finalQualifier?: SportsFinalQualifier
  scoreboard?: SportsScoreboard
}

function publicState(
  status: unknown,
  resolved: boolean
): SportsGameState | undefined {
  if (typeof status !== 'string') return
  switch (status.toUpperCase()) {
    case 'SCHEDULED':
      return resolved ? 'final' : 'scheduled'
    case 'IN_PROGRESS':
      return resolved ? 'final' : 'live'
    case 'DELAYED':
      return resolved ? 'final' : 'delayed'
    case 'POSTPONED':
      return resolved ? 'final' : 'postponed'
    case 'SUSPENDED':
      return resolved ? 'final' : 'suspended'
    case 'FINAL':
      return resolved ? 'final' : 'settling'
    case 'CANCELED':
      return 'canceled'
    case 'ABANDONED':
    case 'UNKNOWN':
    case 'NEEDS_ATTENTION':
    case 'NEEDS-ATTENTION':
    case 'NEEDS ATTENTION':
      return 'unavailable'
    default:
      return undefined
  }
}

function readOptional<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  raw: unknown
): T | undefined {
  const result = schema.safeParse(raw)
  return result.success ? result.data : undefined
}

/** The same public projection is used for stored snapshots and websocket messages. */
export function scheduleScoreFields(
  data: unknown,
  isResolved: boolean
): ScheduleScoreFields {
  if (!data || typeof data !== 'object') return {}
  const record = data as Record<string, unknown>
  const status = record.sportsLiveStatus
  const legacy =
    status === 'IN_PLAY' ||
    status === 'PAUSED' ||
    status === 'FINISHED' ||
    status === 'AWARDED'
  const incomplete =
    record.sportsProvider === 'bdl' &&
    !legacy &&
    (typeof status === 'string' ||
      record.sportsAttentionSince != null ||
      record.sportsAttentionReason != null)
  const gameState =
    publicState(status, isResolved) ?? (incomplete ? 'unavailable' : undefined)
  const resumptionTime =
    gameState === 'suspended' ||
    gameState === 'postponed' ||
    gameState === 'delayed'
      ? readOptional(time, record.sportsResumptionTime)
      : undefined
  const finalQualifier =
    isResolved || gameState === 'settling'
      ? readOptional(qualifier, record.sportsFinalQualifier)
      : undefined
  const p = readOptional(period, record.sportsLivePeriod)
  const c = readOptional(clock, record.sportsLiveClock)
  const s = readOptional(detail, record.sportsLiveDetail)
  return {
    ...(gameState && { gameState }),
    ...(p !== undefined && { period: p }),
    ...(c !== undefined && { clock: c }),
    ...(resumptionTime !== undefined && { resumptionTime }),
    ...(finalQualifier && { finalQualifier }),
    ...(s && Object.keys(s).length > 0 && { scoreboard: s }),
  }
}

const shortDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})
const ordinal = (n: number) => {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? 'th'
      : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return String(n) + suffix
}

function periodLabel(game: ScheduleGame) {
  const period = game.period ?? game.liveScore?.period
  if (period == null) return ''
  const n =
    typeof period === 'number' || /^\d+$/.test(period) ? Number(period) : null
  if (n === null) return String(period)
  switch (game.sport) {
    case 'nba':
    case 'wnba':
    case 'nfl':
    case 'ncaaf':
    case 'wncaab':
      return 'Q' + n
    case 'ncaab':
      return 'H' + n
    case 'nhl':
    case 'hockey':
      return 'P' + n
    case 'mlb': {
      const half = game.scoreboard?.inningHalf
      return (
        (half === 'top' ? 'Top ' : half === 'bottom' ? 'Bottom ' : 'Inning ') +
        (half ? ordinal(n) : n)
      )
    }
    default:
      return String(period)
  }
}

/** Compact factual label. A null result leaves the existing date/time rendering in place. */
export function gameScoreLabel(
  game: ScheduleGame,
  formatResumeDate = (at: number) => shortDate.format(at)
): string | null {
  const state = game.gameState
  if (state === 'scheduled') return null
  if (state === 'suspended' || state === 'delayed' || state === 'postponed') {
    const label = state[0].toUpperCase() + state.slice(1)
    return game.resumptionTime != null
      ? label + ' · resumes ' + formatResumeDate(game.resumptionTime)
      : label
  }
  if (state === 'unavailable')
    return game.isResolved ? 'Result unavailable' : 'Awaiting update'
  if (state === 'canceled') return 'Canceled'
  if (state === 'settling') return 'Final · checking result'
  if (state === 'final' || game.isResolved)
    return game.finalQualifier ? 'Final · ' + game.finalQualifier : 'Final'
  if (state !== 'live' && game.status !== 'live') return null
  const minute = game.liveScore?.minute
  if (game.sport === 'soccer' && minute)
    return /^\d+(?:\+\d+)?$/.test(minute) ? minute + '′' : minute
  return (
    [periodLabel(game), game.clock ?? game.liveScore?.clock]
      .filter(Boolean)
      .join(' ') || 'In progress'
  )
}

/** Team names identify the home/away scores independently of the card's row order. */
export function scoreboardDetailLines(game: ScheduleGame): string[] {
  const board = game.scoreboard
  if (!board) return []
  const lines: string[] = []
  const addPair = (
    label: string,
    pair?: { home: number | null; away: number | null }
  ) => {
    if (!pair || (pair.home === null && pair.away === null)) return
    const values = [
      pair.home === null ? null : game.home.shortName + ' ' + pair.home,
      pair.away === null ? null : game.away.shortName + ' ' + pair.away,
    ].filter(Boolean)
    lines.push(label + ' · ' + values.join(', '))
  }
  const prefix = game.sport === 'nhl' ? 'P' : game.sport === 'ncaab' ? 'H' : 'Q'
  if (['nba', 'wnba', 'ncaab', 'wncaab', 'nfl', 'nhl'].includes(game.sport))
    board.periodScores?.forEach((p, i) => addPair(prefix + (i + 1), p))
  if (game.sport === 'nhl') addPair('Shots', board.shots)
  if (game.sport === 'mlb') {
    if (board.outs != null)
      lines.push(board.outs + (board.outs === 1 ? ' out' : ' outs'))
    if (board.bases) {
      const occupied = ['1st', '2nd', '3rd'].filter((_, i) => board.bases![i])
      lines.push(
        occupied.length ? 'On base · ' + occupied.join(', ') : 'Bases empty'
      )
    }
  }
  if (game.sport === 'nfl' && board.down != null)
    lines.push(
      ordinal(board.down) +
        (board.yardsToGo != null ? ' & ' + board.yardsToGo : ' down')
    )
  if (game.sport === 'soccer') addPair('Red cards', board.redCards)
  return lines
}
