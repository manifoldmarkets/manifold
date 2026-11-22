import { readFileSync } from 'fs'
import { join } from 'path'
import { parseTennisMatch } from './tennis-matches'
import { readTennisDraw } from './tennis-draw'
import { createBdlClient } from '../balldontlie-client'
import { tennisPicks, type TennisMarketSource } from 'common/bdl/tennis-market'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { LIVE_STALE_MS } from 'common/sports-schedule'
import { getMainBinaryMCAnswer, type Contract } from 'common/contract'
const record: Record<string, unknown> = JSON.parse(
  readFileSync(
    join(__dirname, '../../test/fixtures/bdl/atp/matches__completed.json'),
    'utf8'
  )
)
const match = parseTennisMatch('atp', {
  ...record,
  set_scores: [],
  winner: null,
  match_status: 'scheduled',
  status_state: 'scheduled',
})!
const now = 1700000000000,
  contractId = 'local-tennis',
  [a, b] = match.sides
const market: TennisMarketSource = {
  id: contractId,
  creatorId: MANIFOLD_SPORTS_USER_IDS[0],
  token: 'MANA',
  visibility: 'public',
  outcomeType: 'MULTIPLE_CHOICE',
  mechanism: 'cpmm-multi-1',
  addAnswersMode: 'DISABLED',
  shouldAnswersSumToOne: true,
  isResolved: false,
  closeTime: now + 7200000,
  sportsMarketType: 'moneyline',
  sportsProvider: 'bdl',
  sportsEventId: match.eventId,
  sportsLeagueKey: match.tour,
  sportsEntrantIds: [b.id, a.id],
  answers: [
    {
      id: 'b',
      contractId,
      index: 0,
      text: b.name,
      poolYes: 58,
      poolNo: 42,
      p: 0.5,
    },
    {
      id: 'a',
      contractId,
      index: 1,
      text: a.name,
      poolYes: 42,
      poolNo: 58,
      p: 0.5,
    },
  ],
}
const picks = (patch: Partial<TennisMarketSource> = {}) =>
  tennisPicks(match, { ...market, ...patch }, now, now)
it('binds the price, name and native initial outcome independently of player rank, stored answer index and fetched order', () => {
  const source = { ...market, answers: [...market.answers].reverse() }
  const initial = getMainBinaryMCAnswer(source as unknown as Contract)
  expect(initial && initial.id).toBe('a')
  expect(
    picks().map((p) => [
      p.entrantId,
      p.answerId,
      p.nativeSide,
      Math.round(p.probability * 100),
    ])
  ).toEqual([
    [a.id, 'a', 'NO', 58],
    [b.id, 'b', 'YES', 42],
  ])
  expect(
    picks(source).map((p) => [
      p.entrantId,
      p.answerId,
      p.nativeSide,
      Math.round(p.probability * 100),
    ])
  ).toEqual([
    [a.id, 'a', 'YES', 58],
    [b.id, 'b', 'NO', 42],
  ])
})
it('excludes missing, privately held, ambiguous, user-authored, fixture and unrelated markets', () => {
  const bad: Partial<TennisMarketSource>[] = [
    { creatorId: 'community' },
    { token: 'CASH' },
    { visibility: 'private' },
    { visibility: 'unlisted' },
    { deleted: true },
    { sportsFixture: true },
    { sportsMarketType: 'prop' },
    { sportsProvider: 'odds' },
    { sportsLeagueKey: 'wta' },
    { sportsEventId: 'bdl:atp:888:2-5' },
    { sportsEventId: 'bdl:atp:15451:2-55' },
    { isResolved: true },
    { resolution: 'CANCEL' },
    { closeTime: now },
    { closeTime: NaN },
    { shouldAnswersSumToOne: false },
    { addAnswersMode: 'ANYONE' },
    { mechanism: 'cpmm-1' },
    { sportsAttentionReason: 'review' },
    { sportsEntrantIds: [a.id, a.id] },
    { sportsEntrantIds: [a.id, b.id] },
    ...[
      { id: 'a' },
      { contractId: 'other' },
      { index: 1 },
      { isOther: true },
      { resolutionTime: now },
      { p: 0 },
      { poolYes: 0 },
      { poolNo: NaN },
      { poolNo: 100 },
      { text: a.name },
    ].map((change) => ({
      answers: [{ ...market.answers[0], ...change }, market.answers[1]],
    })),
  ]
  expect(tennisPicks(match, undefined, now, now)).toEqual([])
  for (const patch of bad) expect(picks(patch)).toEqual([])
})
it('prevents stale, future, final, suspended and capped selections', () => {
  for (const read of [undefined, null, NaN, now + 1, now - LIVE_STALE_MS])
    expect(tennisPicks(match, market, read, now)).toEqual([])
  expect(
    tennisPicks({ ...match, status: 'live' }, market, now - 1, now)
  ).toHaveLength(2)
  for (const status of [
    'suspended',
    'unavailable',
    'final',
    'canceled',
  ] as const)
    expect(tennisPicks({ ...match, status }, market, now, now)).toEqual([])
  expect(
    tennisPicks({ ...match, eligibleRound: false }, market, now, now)
  ).toEqual([])
  const capped = picks({
    answers: market.answers.map((answer, i) => ({
      ...answer,
      poolYes: i ? 995 : 5,
      poolNo: i ? 5 : 995,
    })),
  })
  expect(capped.find((p) => p.nativeSide === 'YES')?.buyable).toBe(false)
  expect(capped.find((p) => p.nativeSide === 'NO')?.buyable).toBe(true)
})
function provider(responses: unknown[]) {
  const urls: URL[] = []
  let clock = now
  const client = createBdlClient({
    role: 'recorder',
    key: 'test-only',
    clock: {
      now: () => clock,
      sleep: async (ms) => {
        clock += ms
      },
    },
    transport: async (input) => {
      urls.push(new URL(input))
      return new Response(JSON.stringify(responses.shift()), { status: 200 })
    },
  })
  return { client, urls }
}
it('uses only the requested tournament and season, checks every page and admits no missing pair', async () => {
  const { client, urls } = provider([
    { data: [{ ...record, player2: null }], meta: { next_cursor: 'next' } },
    { data: [record] },
  ])
  const view = await readTennisDraw(
    client,
    'atp',
    325,
    2025,
    () => true,
    () => now
  )
  expect(view.readStartedAt).toBe(now)
  expect(view.rounds[0].matches.map((m) => m.id)).toEqual([15451])
  expect(
    urls.map((u) => [
      u.pathname,
      u.searchParams.get('tournament_ids[]'),
      u.searchParams.get('season'),
      u.searchParams.get('cursor'),
    ])
  ).toEqual([
    ['/atp/v1/matches', '325', '2025', null],
    ['/atp/v1/matches', '325', '2025', 'next'],
  ])
  for (const row of [
    { ...record, season: 2024 },
    { ...record, tournament: { id: 100, season: 2025 } },
    { ...record, tournament: { id: 325, season: 2026 } },
  ])
    await expect(
      readTennisDraw(
        provider([{ data: [row] }]).client,
        'atp',
        325,
        2025,
        () => true
      )
    ).rejects.toThrow('ignored the requested filter')
})
it('returns no rows or provider traffic when ATP is off and keeps WTA on the Q13 hold', async () => {
  const { client, urls } = provider([])
  for (const [tour, on] of [
    ['atp', false],
    ['wta', true],
  ] as const)
    expect(await readTennisDraw(client, tour, 325, 2025, () => on)).toEqual({
      readStartedAt: null,
      rounds: [],
    })
  await expect(
    readTennisDraw(client, 'atp', 0, 2025, () => true)
  ).rejects.toThrow('scope')
  expect(urls).toHaveLength(0)
  let enabled = true
  expect(
    await readTennisDraw(
      provider([{ data: [record] }]).client,
      'atp',
      325,
      2025,
      () => {
        const previous = enabled
        enabled = false
        return previous
      }
    )
  ).toEqual({ readStartedAt: null, rounds: [] })
})
