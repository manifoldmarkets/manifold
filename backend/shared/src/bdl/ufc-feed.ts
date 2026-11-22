import { z } from 'zod'
import { bdlHeadToHeadEventId } from 'common/sports-ids'
import { parseSportsKickoffMs } from 'common/sports-kickoff-interface'
import { normalizeBdlStatus, ProviderOdds } from 'common/sports-provider'
import { UFC_SEGMENTS, UfcBout, UfcCard, UfcFighter } from 'common/bdl/ufc'
import type { createBdlClient } from '../balldontlie-client'

type Client = Pick<ReturnType<typeof createBdlClient>, 'get' | 'getAll'>
const id = z.number().int().positive().safe()
const name = z.string().trim().min(1)
const optionalName = z.string().trim().nullish()
const positive = id.nullish()
const count = z.number().int().nonnegative().safe().nullish()
const league = z.object({ id, name, abbreviation: optionalName })
const card = z.object({
  id,
  name,
  date: name,
  league,
  venue_name: optionalName,
  early_prelims_start_time: optionalName,
  prelims_start_time: optionalName,
  main_card_start_time: optionalName,
})
const fighter = z.object({
  id,
  name,
  date_of_birth: optionalName,
  nationality: optionalName,
  height_inches: positive,
  reach_inches: positive,
  stance: optionalName,
  record_wins: count,
  record_losses: count,
  record_draws: count,
  record_no_contests: count,
})
const fight = z.object({
  id,
  event: z.object({ id, league }),
  fighter1: fighter,
  fighter2: fighter,
  winner: z.object({ id }).nullish(),
  weight_class: z.object({ name }).nullish(),
  is_main_event: z.boolean(),
  is_title_fight: z.boolean(),
  card_segment: optionalName,
  fight_order: positive,
  scheduled_rounds: positive,
  status_state: optionalName,
  result_method: optionalName,
  result_method_detail: optionalName,
  result_round: positive,
  result_time: optionalName,
})
const odd = z.object({
  fight_id: id,
  fighter1: z.object({ id }).nullish(),
  fighter2: z.object({ id }).nullish(),
  vendor: name,
  fighter1_odds: z.number().nullish(),
  fighter2_odds: z.number().nullish(),
  updated_at: name,
})
function ufc(value: z.infer<typeof league>) {
  return (
    value.id === 1 &&
    [value.name, value.abbreviation].some(
      (n) =>
        n?.toUpperCase() === 'UFC' ||
        n?.toLowerCase() === 'ultimate fighting championship'
    )
  )
}
function timestamp(value: string | null | undefined) {
  if (!value) return
  const time = parseSportsKickoffMs(
    value.toUpperCase().replace(/(\.\d{3})\d+(?=Z$|[+-]\d\d:\d\d$)/, '$1')
  )
  return Number.isFinite(time) ? time : undefined
}
function dateOnly(value: string | null | undefined) {
  if (!value) return
  if (
    value.length === 10 &&
    Number.isFinite(parseSportsKickoffMs(value + 'T00:00:00Z'))
  )
    return value
  const at = timestamp(value)
  return at == null ? undefined : new Date(at).toISOString().slice(0, 10)
}
export function parseUfcCard(raw: unknown): UfcCard | null {
  const parsed = card.safeParse(raw)
  if (!parsed.success || !ufc(parsed.data.league)) return null
  const row = parsed.data
  const date = dateOnly(row.date)
  if (!date) return null
  const starts: UfcCard['starts'] = {}
  for (const segment of UFC_SEGMENTS) {
    const ms = timestamp(row[`${segment}_start_time`])
    if (ms != null) starts[segment] = ms
  }
  return {
    id: row.id,
    name: row.name,
    date,
    venue: row.venue_name || undefined,
    starts,
  }
}
function publicFighter(f: z.infer<typeof fighter>): UfcFighter {
  return {
    id: f.id,
    name: f.name,
    born: dateOnly(f.date_of_birth),
    nationality: f.nationality || undefined,
    heightInches: f.height_inches ?? undefined,
    reachInches: f.reach_inches ?? undefined,
    stance: f.stance || undefined,
    wins: f.record_wins ?? undefined,
    losses: f.record_losses ?? undefined,
    draws: f.record_draws ?? undefined,
    noContests: f.record_no_contests ?? undefined,
  }
}
export function parseUfcBout(raw: unknown, cardId: number): UfcBout | null {
  const parsed = fight.safeParse(raw)
  if (!parsed.success) return null
  const r = parsed.data
  if (
    r.event.id !== cardId ||
    !ufc(r.event.league) ||
    r.fighter1.id === r.fighter2.id
  )
    return null
  return {
    id: r.id,
    cardId,
    eventId: bdlHeadToHeadEventId('mma', r.id, r.fighter1.id, r.fighter2.id),
    fighters: [publicFighter(r.fighter1), publicFighter(r.fighter2)],
    segment: UFC_SEGMENTS.find((s) => s === r.card_segment) ?? null,
    order: r.fight_order ?? null,
    scheduledRounds: r.scheduled_rounds ?? null,
    headline: r.is_main_event,
    titleFight: r.is_title_fight,
    weightClass: r.weight_class?.name,
    status: normalizeBdlStatus(r.status_state),
    winnerId: r.winner?.id ?? null,
    method: r.result_method || null,
    methodDetail: r.result_method_detail || null,
    resultRound: r.result_round ?? null,
    resultTime:
      r.result_time && /^(?:[0-4]:[0-5]\d|5:00)$/.test(r.result_time)
        ? r.result_time
        : null,
  }
}
export async function fetchUfcCards(client: Client, year: number) {
  const rows = await client.getAll<unknown>(
    '/mma/v1/events',
    { year },
    {
      maxPages: 12,
      matches: (value) => {
        const result = z.object({ date: name }).safeParse(value)
        return result.success && result.data.date.startsWith(String(year) + '-')
      },
    }
  )
  return rows.map(parseUfcCard).filter((c): c is UfcCard => c !== null)
}
export async function fetchUfcBouts(client: Client, cardId: number) {
  const expected = id.parse(cardId)
  const rows = await client.getAll<unknown>(
    '/mma/v1/fights',
    { 'event_ids[]': [expected] },
    {
      maxPages: 4,
      matches: (value) =>
        z
          .object({ event: z.object({ id: z.literal(expected) }) })
          .safeParse(value).success,
    }
  )
  const listed = rows.map((r) =>
    z.object({ id, card_segment: optionalName }).parse(r)
  )
  if (new Set(listed.map((b) => b.id)).size !== listed.length)
    throw new Error('Repeated UFC bout in the requested card')
  // Include unpriced or TBA bouts when computing their segment's safety window.
  const segmentSizes = Object.fromEntries(
    UFC_SEGMENTS.map((segment) => [
      segment,
      listed.filter((b) => b.card_segment === segment).length,
    ])
  )
  return {
    bouts: rows
      .map((r) => parseUfcBout(r, expected))
      .filter((b): b is UfcBout => b !== null),
    listedIds: listed.map((r) => r.id),
    segmentSizes,
  }
}
export async function fetchUfcOdds(
  client: Client,
  cardId: number,
  bouts: readonly UfcBout[],
  listedIds: readonly number[] = bouts.map((b) => b.id)
): Promise<ProviderOdds[]> {
  if (bouts.some((b) => b.cardId !== cardId))
    throw new Error('UFC odds require one card')
  const { body } = await client.get('/mma/v1/odds', {
    event_id: id.parse(cardId),
  })
  const { data } = z.object({ data: z.array(odd) }).parse(body)
  const byId = new Map(bouts.map((b) => [b.id, b]))
  return data.flatMap((row) => {
    const bout = byId.get(row.fight_id)
    if (!listedIds.includes(row.fight_id))
      throw new Error('UFC odds returned an unrequested fight')
    if (!bout) return []
    const a = row.fighter1?.id,
      b = row.fighter2?.id
    const at = timestamp(row.updated_at)
    if (
      !a ||
      !b ||
      a === b ||
      at == null ||
      ![a, b].every((i) => bout.fighters.some((f) => f.id === i))
    )
      return []
    return [
      {
        eventId: bout.eventId,
        vendor: row.vendor,
        updatedAtMs: at,
        outcomes: [
          {
            outcome: { entrantId: String(a) },
            americanOdds: row.fighter1_odds ?? NaN,
          },
          {
            outcome: { entrantId: String(b) },
            americanOdds: row.fighter2_odds ?? NaN,
          },
        ],
      },
    ]
  })
}
