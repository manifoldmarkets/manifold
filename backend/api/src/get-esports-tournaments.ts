import { type EsportsMarketOverlay } from 'common/api/schema'
import { buildTournamentViews } from 'common/esports/structure'
import {
  EsportsGame,
  EsportsSeriesFacts,
  EsportsSeriesStatus,
  EsportsTeamRef,
} from 'common/esports/types'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { parseBdlEventId } from 'common/sports-ids'
import { tsToMillis } from 'common/supabase/utils'
import { DAY_MS } from 'common/util/time'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { type APIHandler } from './helpers/endpoint'

// A tournament's series close within weeks of each other, so one window
// around today holds the tournament being played, the last one and the next.
const WINDOW_DAYS = 45
// More markets than this in the window and the read is cut short. A stage
// missing some of its series would show wrong standings, so nothing is worked
// out from a cut read: every stage is a plain list.
const MAX_SERIES = 2000

type AnswerRow = { id: string; text: string | null; prob: number | null }
type SeriesRow = {
  id: string
  slug: string
  close_time: string | null
  resolution: string | null
  event_id: string | null
  creator_username: string | null
  series: unknown
  volume: unknown
  unique_bettor_count: unknown
  answers: AnswerRow[] | null
}

/**
 * A game's tournaments, built only from the series facts the pipeline stored
 * on each official series market, and each series' market to lay over them.
 */
export const getEsportsTournaments: APIHandler<
  'get-esports-tournaments'
> = async ({ game }) => {
  const pg = createSupabaseDirectClient()
  const now = Date.now()
  // Anyone can stamp a sportsEventId through the API; only the @ManifoldSports
  // accounts' markets are series. The first six conditions repeat
  // contracts_sports_schedule_idx's own, so the planner can range-scan it by
  // close time; where that index isn't built yet it reads by creator and
  // close time instead. Three answers are enough to tell a market that isn't
  // one team against another. One row past the cap tells a cut read.
  const found = await pg.manyOrNone<SeriesRow>(
    `select c.id, c.slug, c.close_time, c.resolution,
            c.data->>'sportsEventId' as event_id,
            c.data->>'creatorUsername' as creator_username,
            c.data->'esportsSeries' as series,
            c.data->'volume' as volume,
            c.data->'uniqueBettorCount' as unique_bettor_count,
            (select jsonb_agg(
                      jsonb_build_object('id', a.id, 'text', a.text, 'prob', a.prob)
                      order by a.index)
             from (select x.id, x.text, x.prob, x.index from answers x
                   where x.contract_id = c.id
                   order by x.index
                   limit 3) a) as answers
     from contracts c
     where c.data->>'sportsEventId' is not null
       and c.visibility = 'public'
       and c.token = 'MANA'
       and coalesce(c.deleted, false) = false
       and c.resolution is distinct from 'CANCEL'
       and c.close_time > $1 and c.close_time < $2
       and starts_with(c.data->>'sportsEventId', $3)
       and c.data ? 'esportsSeries'
       and c.creator_id = any($4)
     order by c.close_time desc, c.id desc
     limit $5`,
    [
      new Date(now - WINDOW_DAYS * DAY_MS),
      new Date(now + WINDOW_DAYS * DAY_MS),
      `bdl:${game}:`,
      MANIFOLD_SPORTS_USER_IDS,
      MAX_SERIES + 1,
    ]
  )
  const truncated = found.length > MAX_SERIES
  if (truncated)
    log.warn('get-esports-tournaments hit its row cap: standings not derived', {
      game,
      MAX_SERIES,
    })

  // One market per series, among those whose event id is exactly
  // `bdl:<game>:<id>` and whose stored facts name that same match. Where
  // several carry the series, the latest capture is the one to believe, and
  // the market shown is the one those facts came from.
  const chosen = new Map<number, Candidate>()
  for (const row of found.slice(0, MAX_SERIES)) {
    const event = parseBdlEventId(row.event_id)
    if (event?.league !== game || event.suffix !== undefined) continue
    const facts = readSeriesFacts(row.series, game, event.id)
    if (!facts) continue
    const candidate = { facts, row }
    const held = chosen.get(facts.id)
    if (!held || isLaterCapture(candidate, held))
      chosen.set(facts.id, candidate)
  }
  const markets: Record<string, EsportsMarketOverlay> = {}
  for (const { facts, row } of chosen.values()) {
    const overlay = toMarketOverlay(facts, row)
    if (overlay) markets[facts.id] = overlay
  }
  const series = [...chosen.values()].map((c) => c.facts)
  return {
    tournaments: buildTournamentViews(series, [], { derive: !truncated }),
    markets,
    ...(truncated ? { truncated } : {}),
  }
}

type Candidate = { facts: EsportsSeriesFacts; row: SeriesRow }

// The greatest capture time wins, then the latest close time, then the
// greater market id: always the same market, whatever order the rows came in.
function isLaterCapture(a: Candidate, b: Candidate) {
  const rank = (c: Candidate) => {
    const closeTime = tsToMillis(c.row.close_time)
    return [
      c.facts.observedAtMs ?? -Infinity,
      Number.isFinite(closeTime) ? closeTime : -Infinity,
    ]
  }
  const [capturedA, closesA] = rank(a)
  const [capturedB, closesB] = rank(b)
  if (capturedA !== capturedB) return capturedA > capturedB
  if (closesA !== closesB) return closesA > closesB
  return a.row.id > b.row.id
}

/** The widest range a Date holds. A start outside it isn't a time. */
const MAX_TIME_MS = 8.64e15
const STATUSES: readonly EsportsSeriesStatus[] = [
  'scheduled',
  'in_progress',
  'final',
]
type Json = Record<string, unknown>
const asObject = (v: unknown): Json | undefined =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Json)
    : undefined

// Each reader returns the value, or undefined where it isn't what the facts
// allow. Null is a value: most fields may be empty.
const readId = (v: unknown) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : undefined
const readCount = (v: unknown) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : undefined
const readTime = (v: unknown) =>
  typeof v === 'number' && Math.abs(v) <= MAX_TIME_MS ? v : undefined
const readText = (v: unknown) => (typeof v === 'string' ? v : undefined)
const readName = (v: unknown) =>
  typeof v === 'string' && v.trim() ? v : undefined
const orNull =
  <T>(read: (v: unknown) => T | undefined) =>
  (v: unknown) =>
    v === null ? null : read(v)
/** For a field the facts may leave out: absent reads as empty. */
const orAbsent =
  <T>(read: (v: unknown) => T | undefined) =>
  (v: unknown) =>
    v === undefined || v === null ? null : read(v)
/** The object, or undefined when any of its fields failed to read. */
const whole = <T extends Json>(fields: T) =>
  Object.values(fields).includes(undefined)
    ? undefined
    : (fields as { [K in keyof T]: Exclude<T[K], undefined> })

const readTeam = (v: unknown): EsportsTeamRef | null | undefined => {
  if (v === null) return null
  const r = asObject(v)
  return whole({
    id: readId(r?.id),
    name: readName(r?.name),
    code: orNull(readText)(r?.code),
  })
}
const readStage = (v: unknown) => {
  if (v === null) return null
  const r = asObject(v)
  return whole({
    id: readId(r?.id),
    name: readName(r?.name),
    type: orAbsent(readText)(r?.type),
    order: orAbsent(readCount)(r?.order),
    roundsCount: orAbsent(readId)(r?.roundsCount),
  })
}
const readScore = (v: unknown) => {
  if (v === null) return null
  const r = asObject(v)
  return whole({ team1: readCount(r?.team1), team2: readCount(r?.team2) })
}

/**
 * The facts stored on a market, checked field by field against
 * `EsportsSeriesFacts`, or null when any of them is off: a missing field, a
 * wrong type, an ID or count that isn't a safe whole number, a time no date
 * holds, a status we don't show. The facts are the pipeline's own, but a
 * malformed blob must cost one series, not the page, and must never count
 * as a result. What is returned holds the facts' own fields and no others.
 *
 * A winner stands only on what makes a result: a final series with nothing
 * held and two different teams, won by one of them. Otherwise the series
 * stays, with no winner.
 */
function readSeriesFacts(
  value: unknown,
  game: EsportsGame,
  id: number
): EsportsSeriesFacts | null {
  const s = asObject(value)
  const t = asObject(s?.tournament)
  if (!s || s.game !== game || s.id !== id || readId(id) === undefined)
    return null
  const facts = whole({
    game,
    id,
    tournament: whole({
      id: readId(t?.id),
      name: readName(t?.name),
      tier: orNull(readText)(t?.tier),
    }),
    stage: readStage(s.stage),
    round: orNull(readText)(s.round),
    position: orNull(readId)(s.position),
    bestOf: orNull(readId)(s.bestOf),
    startTimeMs: orNull(readTime)(s.startTimeMs),
    status: STATUSES.find((status) => status === s.status),
    rawStatus: orAbsent(readText)(s.rawStatus),
    team1: readTeam(s.team1),
    team2: readTeam(s.team2),
    score: readScore(s.score),
    winnerId: orNull(readId)(s.winnerId),
    review: orNull(readText)(s.review),
    observedAtMs: orAbsent(readTime)(s.observedAtMs),
  })
  if (!facts) return null
  const { team1, team2, winnerId } = facts
  const won =
    facts.review === null &&
    facts.status === 'final' &&
    !!team1 &&
    !!team2 &&
    team1.id !== team2.id &&
    (winnerId === team1.id || winnerId === team2.id)
  return { ...facts, winnerId: won ? winnerId : null }
}

const normalizeName = (name: string) =>
  name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
const sameName = (a: string | null, b: string | null) =>
  !!a && !!b && normalizeName(a) === normalizeName(b)
const finiteOr = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

/**
 * A series' market as the page shows it. An answer is tied to a team only
 * when the market has exactly two answers with usable prices, the first
 * named as team 1 and the second as team 2. A price is a bet button, so a
 * market that doesn't line up gets a plain link instead of a guess.
 */
export function toMarketOverlay(
  facts: Pick<EsportsSeriesFacts, 'team1' | 'team2'>,
  row: Omit<SeriesRow, 'event_id' | 'series'>
): EsportsMarketOverlay | null {
  if (!row.creator_username) return null
  const { team1, team2 } = facts
  const answers = row.answers ?? []
  const [first, second] = answers
  const teamIds =
    answers.length === 2 &&
    answers.every(
      (a) => typeof a.prob === 'number' && a.prob >= 0 && a.prob <= 1
    ) &&
    team1 &&
    team2 &&
    team1.id !== team2.id &&
    !sameName(team1.name, team2.name) &&
    sameName(first.text, team1.name) &&
    sameName(second.text, team2.name)
      ? [team1.id, team2.id]
      : []
  const closeTime = tsToMillis(row.close_time)
  return {
    contractId: row.id,
    slug: row.slug,
    creatorUsername: row.creator_username,
    answers: answers.map((a, i) => ({
      id: a.id,
      text: a.text ?? '',
      prob: finiteOr(a.prob, 0),
      teamId: teamIds[i] ?? null,
    })),
    volume: finiteOr(row.volume, 0),
    uniqueBettorCount: finiteOr(row.unique_bettor_count, 0),
    closeTime: Number.isFinite(closeTime) ? closeTime : null,
    isResolved: row.resolution != null,
  }
}
