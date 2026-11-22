import { BDL_LEAGUES } from 'common/bdl/leagues'
import { BDL_CANCELLATION_HOLD_MS } from 'common/bdl/constants'
import {
  UFC_DRAW_FLOOR,
  UFC_OPPONENT_CHANGE_HOLD_MS,
  ufcCloseTime,
  ufcOpeningLine,
  ufcWinnerDecision,
  UfcBout,
  UfcObservation,
} from 'common/bdl/ufc'
import { bdlStatsEndpoint } from './request-stats'
import {
  parseUfcCard,
  parseUfcBout,
  fetchUfcBouts,
  fetchUfcCards,
  fetchUfcOdds,
} from './ufc-feed'
import { createBdlClient } from '../balldontlie-client'

const at = Date.parse('2026-11-21T18:00:00Z')
const cardRaw = {
  id: 52,
  name: 'Fight Night',
  league: { id: 1, name: 'UFC' },
  date: '2026-11-21',
  main_card_start_time: '2026-11-21T18:00:00.000Z',
}
const fighter1 = { id: 11, name: 'Alex West', record_draws: 0, record_wins: 8 }
const fighter2 = { id: 22, name: 'Ben East', record_losses: 2 }
const fightRaw = {
  id: 80,
  event: cardRaw,
  fighter1,
  fighter2,
  card_segment: 'main_card',
  fight_order: 2,
  scheduled_rounds: 3,
  is_main_event: false,
  is_title_fight: false,
  status_state: 'final',
  winner: { id: 22 },
  result_method: 'Decision',
  result_method_detail: '28-29 | 28-29 | 28-29',
  result_time: '5:00',
  result_round: 3,
}
const bout = parseUfcBout(fightRaw, 52)!
const noResult = {
  winnerId: null,
  method: null,
  methodDetail: null,
  resultRound: null,
  resultTime: null,
}
const market = {
  fightId: 80,
  fighterIds: [11, 22] as const,
  observedAt: null,
  observation: null,
}
const decide = (
  changes: Partial<UfcBout>,
  time = at,
  observation: UfcObservation | null = null,
  delay = 0
) =>
  ufcWinnerDecision(
    { ...market, observation },
    { ...bout, ...changes },
    time,
    delay
  )
function clientFor(body: unknown) {
  let time = at
  const clock = {
    now: () => time,
    sleep: async (ms: number) => {
      time += ms
    },
  }
  const transport = jest.fn(
    async () => new Response(JSON.stringify(body), { status: 200 })
  )
  const client = createBdlClient({
    role: 'recorder',
    clock,
    transport,
    key: 'test-only',
  })
  return { client, transport }
}
test('accepts only UFC and an exact calendar date; the segment remains distinct from each fight start', () => {
  expect(parseUfcCard(cardRaw)).toMatchObject({
    date: '2026-11-21',
    starts: { main_card: at },
  })
  for (const date of ['2026-11-31', '2026-11-21 junk'])
    expect(parseUfcCard({ ...cardRaw, date })).toBeNull()
  expect(
    parseUfcCard({ ...cardRaw, league: { id: 2, name: 'UFC' } })
  ).toBeNull()
  expect(
    parseUfcCard({ ...cardRaw, main_card_start_time: 'soon' })?.starts
  ).toEqual({})
  expect(BDL_LEAGUES.mma.fightCloseRule).toBe('in-play')
})
test('locks identity to the same unordered fighter IDs and UFC event, preserves real zeroes and rejects synthetic result clocks', () => {
  expect(bout).toMatchObject({
    id: 80,
    eventId: 'bdl:mma:80:11-22',
    status: 'final',
    resultTime: '5:00',
    scheduledRounds: 3,
    fighters: [{ id: 11, draws: 0 }, { id: 22 }],
  })
  expect(
    parseUfcBout({ ...fightRaw, fighter1: fighter2, fighter2: fighter1 }, 52)
      ?.eventId
  ).toBe(bout.eventId)
  expect(parseUfcBout({ ...fightRaw, fighter1: fighter2 }, 52)).toBeNull()
  expect(
    parseUfcBout({ ...fightRaw, result_time: '5:59' }, 52)?.resultTime
  ).toBeNull()
  expect(
    parseUfcBout({ ...fightRaw, status_state: null, status: 'final' }, 52)
      ?.status
  ).toBe('unknown')
  expect(parseUfcBout(fightRaw, 90)).toBeNull()
})
test.each(['scheduled', 'in_progress', 'suspended', 'unknown'] as const)(
  'retains open trading before a confirmed result on %s',
  (status) => {
    expect(decide({ status })).toMatchObject({ kind: 'attention', close: true })
    expect(decide({ ...noResult, status })).toMatchObject({
      kind: 'hold',
      close: false,
      observation: null,
    })
  }
)
test.each([
  ['KO/TKO', 22, 22],
  ['Submission', 11, 11],
  ['Decision', 22, 22],
  ['Technical decision', 11, 11],
  ['Disqualification', 22, 22],
  ['Draw', null, 'draw-or-no-contest'],
  ['No Contest', null, 'draw-or-no-contest'],
  ['Technical draw', null, 'draw-or-no-contest'],
] as const)(
  'pays the confirmed %s result only to the stable matching answer',
  (method, winnerId, outcome) => {
    expect(decide({ method, winnerId })).toMatchObject({
      kind: 'resolve',
      close: true,
      outcome,
    })
  }
)
test.each([
  ['Decision', null],
  ['Submission', 91],
  ['No Contest', 22],
  ['Unknown', 11],
] as const)(
  'routes inconsistent %s winner %s to review',
  (method, winnerId) => {
    expect(decide({ method, winnerId })).toMatchObject({
      kind: 'attention',
      close: true,
    })
  }
)
test('distinguishes an explicit technical draw from a conflicted or unknown finish', () => {
  expect(
    decide({
      method: 'Decision',
      methodDetail: 'Technical Draw',
      winnerId: null,
    })
  ).toMatchObject({ kind: 'resolve', outcome: 'draw-or-no-contest' })
  expect(
    decide({ method: 'Decision', methodDetail: 'Technical Draw', winnerId: 22 })
  ).toMatchObject({ kind: 'attention' })
  expect(
    decide({ method: 'No contest', methodDetail: 'Submission', winnerId: null })
  ).toMatchObject({ kind: 'attention' })
})
test('a changed normalized result restarts the delay; stale pages and absence cannot establish a new final', () => {
  const initial = decide({}, at, null, 100)
  expect(initial).toMatchObject({ kind: 'hold', close: true })
  expect(decide({}, at, initial.observation, 100)).toMatchObject({
    kind: 'hold',
    reason: 'No newer observation',
  })
  const revised = decide({ winnerId: 11 }, at + 99, initial.observation, 100)
  expect(revised).toMatchObject({
    kind: 'hold',
    observation: { since: at + 99 },
  })
  expect(
    decide({ winnerId: 11 }, at + 199, revised.observation, 100)
  ).toMatchObject({ kind: 'resolve', outcome: 11 })
  expect(ufcWinnerDecision(market, null, at)).toMatchObject({
    kind: 'hold',
    reason: 'Fight unobserved',
  })
  expect(
    ufcWinnerDecision({ ...market, observedAt: at + 1 }, bout, at)
  ).toMatchObject({ kind: 'hold', reason: 'No newer observation' })
  expect(
    decide({ ...noResult, status: 'scheduled' }, at + 101, initial.observation)
  ).toMatchObject({ kind: 'hold', observation: null })
})
test('swapping corners preserves the winner; each confirmed replacement/cancellation has its own persistence window', () => {
  const [a, b] = bout.fighters
  expect(decide({ fighters: [b, a] })).toMatchObject({
    kind: 'resolve',
    outcome: 22,
  })
  const moved: Partial<UfcBout> = { fighters: [a, { id: 33, name: 'Third' }] }
  const pending = decide(moved)
  expect(pending).toMatchObject({ kind: 'hold', close: true })
  expect(
    decide(moved, at + UFC_OPPONENT_CHANGE_HOLD_MS - 1, pending.observation)
      .kind
  ).toBe('hold')
  expect(
    decide(moved, at + UFC_OPPONENT_CHANGE_HOLD_MS, pending.observation)
  ).toMatchObject({ kind: 'resolve', outcome: 'CANCEL' })
  expect(
    decide(
      { fighters: [a, { id: 44, name: 'Fourth' }] },
      at + UFC_OPPONENT_CHANGE_HOLD_MS,
      pending.observation
    ).kind
  ).toBe('hold')
  const cancelled = decide({ ...noResult, status: 'canceled' })
  expect(
    decide(
      { ...noResult, status: 'canceled' },
      at + BDL_CANCELLATION_HOLD_MS - 1,
      cancelled.observation
    ).kind
  ).toBe('hold')
  expect(
    decide(
      { ...noResult, status: 'canceled' },
      at + BDL_CANCELLATION_HOLD_MS,
      cancelled.observation
    )
  ).toMatchObject({ kind: 'resolve', outcome: 'CANCEL' })
  expect(
    ufcWinnerDecision({ ...market, fighterIds: [11, 11] }, bout, at)
  ).toMatchObject({ kind: 'attention' })
})
test('uses known segment/rank to bound in-play trading; segment-only close needs no guessed round/order', () => {
  const card = parseUfcCard(cardRaw)!
  expect(ufcCloseTime(card, bout, 2, 'in-play')).toBe(at + 47 * 60000)
  expect(ufcCloseTime(card, { ...bout, order: 1 }, 2, 'in-play')).toBe(
    at + 92 * 60000
  )
  expect(
    ufcCloseTime(
      card,
      { ...bout, order: null, scheduledRounds: null },
      0,
      'segment-start'
    )
  ).toBe(at)
  expect(ufcCloseTime({ ...card, starts: {} }, bout, 2, 'in-play')).toBeNull()
  expect(
    ufcCloseTime(card, { ...bout, scheduledRounds: null }, 2, 'in-play')
  ).toBeNull()
})
test('scopes UFC-only service telemetry templates', () => {
  for (const resource of ['events', 'fights', 'rankings']) {
    expect(bdlStatsEndpoint('/mma/v1/' + resource)).toEqual({
      league: 'mma',
      template: 'v1/' + resource,
    })
    expect(bdlStatsEndpoint('/nba/v1/' + resource)).toBeUndefined()
  }
})
test('year/card filters remain enforced, TBD opponents count toward the segment, duplicate identities fail closed', async () => {
  const eventClient = clientFor({
    data: [cardRaw],
    meta: { next_cursor: null },
  })
  expect(await fetchUfcCards(eventClient.client, 2026)).toHaveLength(1)
  const fights = clientFor({
    data: [fightRaw, { ...fightRaw, id: 81, fighter2: null }],
    meta: { next_cursor: null },
  })
  expect(await fetchUfcBouts(fights.client, 52)).toMatchObject({
    bouts: [{ id: 80 }],
    listedIds: [80, 81],
    segmentSizes: { main_card: 2 },
  })
  const repeated = clientFor({
    data: [fightRaw, fightRaw],
    meta: { next_cursor: null },
  })
  await expect(fetchUfcBouts(repeated.client, 52)).rejects.toThrow('Repeated')
  const wrong = clientFor({
    data: [{ ...fightRaw, event: { ...cardRaw, id: 53 } }],
    meta: { next_cursor: null },
  })
  await expect(fetchUfcBouts(wrong.client, 52)).rejects.toThrow()
})
test('maps provider odds by fighter ID, reserves the neutral floor and never borrows opponents or stale quotes', async () => {
  const row = {
    fight_id: 80,
    fighter1: { id: 22 },
    fighter2: { id: 11 },
    vendor: 'sample',
    fighter1_odds: -150,
    fighter2_odds: 130,
    updated_at: new Date(at).toISOString(),
  }
  const { client } = clientFor({
    data: [row, { ...row, fight_id: 81 }, { ...row, fighter1: { id: 33 } }],
  })
  const odds = await fetchUfcOdds(client, 52, [bout], [80, 81])
  expect(odds).toHaveLength(1)
  const line = ufcOpeningLine(bout, odds, at)
  expect(line.source).toBe('books')
  expect(line.probs[1]).toBeGreaterThan(line.probs[0])
  expect(line.probs[2]).toBe(UFC_DRAW_FLOOR)
  expect(line.probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 14)
  expect(ufcOpeningLine(bout, odds, at + 366 * 86400000).source).toBe('none')
  await expect(fetchUfcOdds(client, 52, [bout])).rejects.toThrow('unrequested')
})
