import { MANIFOLD_SPORTS_USER_IDS } from '../sports'
import { LIVE_STALE_MS } from '../sports-schedule'
import type { GolfField, GolfPlayer } from './golf'
import { currentGolfPick, golfMarketView, type GolfMarket } from './golf-market'

const now = 1800000000000
const named = (playerId: number, name: string): GolfPlayer => ({
  playerId,
  name,
  competitorId: 100 + playerId,
  state: 'active',
  fieldPresent: true,
  position: null,
  toPar: null,
  through: null,
})
const field: GolfField = {
  tournament: {
    tour: 'pga',
    id: 6904,
    season: 2026,
    eventId: 'bdl:pga:6904',
    name: 'The RSM Classic',
    course: null,
    state: 'live',
    round: 2,
    format: 'STROKE_PLAY',
    startDate: null,
    endDate: null,
  },
  readStartedAt: now - 60000,
  hasResults: false,
  incomplete: false,
  players: [named(2, 'Alex'), named(1, 'Morgan'), named(4, 'Robin')],
}
const market: GolfMarket = {
  id: 'market',
  creatorId: MANIFOLD_SPORTS_USER_IDS[0],
  visibility: 'public',
  token: 'MANA',
  mechanism: 'cpmm-multi-1',
  outcomeType: 'MULTIPLE_CHOICE',
  sportsProvider: 'bdl',
  sportsLeagueKey: 'pga',
  sportsEventId: 'bdl:pga:6904',
  sportsEntrantIds: [1, 2, null],
  sportsMarketType: 'winner',
  shouldAnswersSumToOne: true,
  isResolved: false,
  closeTime: now + 600000,
  answers: [
    [2, 'Other', 10],
    [0, 'Morgan', 55],
    [1, 'Alex', 35],
  ].map(([index, name, p]) => ({
    id: 'a' + index,
    index: Number(index),
    text: String(name),
    isOther: name === 'Other',
    contractId: 'market',
    p: 0.5,
    poolYes: 100 - Number(p),
    poolNo: Number(p),
  })),
}
it('binds named outcomes by player ID and answer index independent of field and answer ordering', () => {
  const view = golfMarketView(field, market, now)
  expect(
    view?.picks.map((p) => [p.playerId, p.answerId, p.probability, p.buyable])
  ).toEqual([
    [1, 'a0', 0.55, true],
    [2, 'a1', 0.35, true],
    [null, 'a2', 0.1, true],
  ])
})
it('rechecks the clicked player or Other against the live cutoff, source, native answer and quoted pool', () => {
  const open = { ...market, closeTime: now + 300 }
  const picks = golfMarketView(field, open, now)!.picks
  for (const pick of picks) {
    expect(currentGolfPick(field, open, pick, now + 299)).toEqual(pick)
    expect(currentGolfPick(field, open, pick, now + 300)).toBeUndefined()
    expect(currentGolfPick(field, open, pick, now + 550)).toBeUndefined()
    expect(
      currentGolfPick(field, { ...open, visibility: 'private' }, pick, now)
    ).toBeUndefined()
    expect(
      currentGolfPick(field, open, { ...pick, contractId: 'other' }, now)
    ).toBeUndefined()
    expect(
      currentGolfPick(field, open, { ...pick, eventId: 'bdl:pga:9' }, now)
    ).toBeUndefined()
    expect(
      currentGolfPick(field, open, { ...pick, playerId: 99 }, now)
    ).toBeUndefined()
    expect(
      currentGolfPick(field, open, { ...pick, answerId: 'removed' }, now)
    ).toBeUndefined()
    expect(
      currentGolfPick(field, open, { ...pick, probability: 0.99 }, now)
    ).toBeUndefined()
    expect(
      currentGolfPick(
        { ...field, readStartedAt: now - LIVE_STALE_MS + 100 },
        open,
        pick,
        now + 100
      )
    ).toBeUndefined()
  }
})

it('rebinds market kind for every pick and the named field excluded by Other', () => {
  const picks = golfMarketView(field, market, now)!.picks
  const other = picks.find((p) => p.playerId === null)!
  const withThird = { ...field, players: [...field.players, named(3, 'Casey')] }
  const remapped = {
    ...market,
    sportsEntrantIds: [1, 3, null],
    answers: market.answers.map((a) =>
      a.index === 1 ? { ...a, text: 'Casey' } : a
    ),
  }
  expect(currentGolfPick(withThird, remapped, other, now)).toBeUndefined()
  expect(currentGolfPick(withThird, remapped, picks[0], now)).toEqual(picks[0])
  const reordered = {
    ...market,
    sportsEntrantIds: [2, 1, null],
    answers: market.answers
      .map((a) => (a.isOther ? a : { ...a, index: 1 - a.index }))
      .reverse(),
  }
  expect(currentGolfPick(field, reordered, other, now)).toEqual(other)
  const top = {
    ...market,
    sportsMarketType: 'top_n',
    topN: 10,
    shouldAnswersSumToOne: false,
    sportsEntrantIds: [1, 2],
    answers: market.answers.filter((a) => !a.isOther),
  }
  const topPick = golfMarketView(field, top, now)!.picks[0]
  expect(currentGolfPick(field, top, picks[0], now)).toBeUndefined()
  expect(currentGolfPick(field, market, topPick, now)).toBeUndefined()
})
it('requires active evidence for a live named quote; a scheduled roster entry suffices', () => {
  const entered = {
    ...field,
    players: field.players.map((p) => ({ ...p, state: 'entered' as const })),
  }
  expect(
    golfMarketView(entered, market, now)
      ?.picks.filter((p) => p.playerId !== null)
      .every((p) => !p.buyable)
  ).toBe(true)
  expect(
    golfMarketView(
      { ...entered, tournament: { ...field.tournament, state: 'scheduled' } },
      market,
      now
    )?.picks.every((p) => p.buyable)
  ).toBe(true)
})

it('requires unique exact event, positions, IDs, and participant labels', () => {
  const s = { ...market },
    a = s.answers
  for (const bad of [
    { sportsEventId: 'bdl:pga:7' },
    { sportsLeagueKey: 'lpga' as const },
    { creatorId: 'user' },
    { sportsProvider: 'odds' as const },
    { sportsFixture: true as const },
    { token: 'CASH' },
    { visibility: 'unlisted' },
    { deleted: true },
    { shouldAnswersSumToOne: false },
    { sportsEntrantIds: [2, 1, null] },
    { sportsEntrantIds: [1, 2, 1] },
    { answers: [a[0], a[1], { ...a[2], index: 0 }] },
    { answers: [a[0], a[1], { ...a[2], id: a[1].id }] },
    { answers: [a[0], a[1], { ...a[2], text: 'Morgan' }] },
    { answers: [a[0], a[1], { ...a[2], contractId: 'different' }] },
  ]) {
    expect(golfMarketView(field, { ...s, ...bad }, now)).toBeNull()
  }
})
it.each([NaN, Infinity, -1, 0])(
  'rejects unusable pool or unrelated Other %s',
  (value) => {
    expect(
      golfMarketView(
        field,
        {
          ...market,
          answers: market.answers.map((a, i) =>
            i === 1 ? { ...a, poolNo: value } : a
          ),
        },
        now
      )
    ).toBeNull()
    expect(
      golfMarketView(
        field,
        {
          ...market,
          answers: market.answers.map((a) =>
            a.isOther ? { ...a, text: 'Player 1' } : a
          ),
        },
        now
      )
    ).toBeNull()
  }
)
it('requires linked winner probabilities to sum to one but top-ten outcomes are independently priced', () => {
  const answers = market.answers
    .filter((a) => !a.isOther)
    .map((a) => ({ ...a, poolYes: 25, poolNo: 75 }))
  const top = {
    ...market,
    sportsMarketType: 'top_n',
    topN: 10,
    shouldAnswersSumToOne: false,
    sportsEntrantIds: [1, 2],
    answers,
  }
  expect(
    golfMarketView(field, top, now)?.picks.map((p) => p.probability)
  ).toEqual([0.75, 0.75])
  expect(golfMarketView(field, { ...top, topN: 20 }, now)).toBeNull()
  expect(
    golfMarketView(
      field,
      { ...market, answers: [...answers, market.answers[0]] },
      now
    )
  ).toBeNull()
})
it('retains labelled held odds and suppresses every action at strict deadline, future receipt, stale snapshot, closed or unresolved conflict', () => {
  for (const m of [
    { ...market, closeTime: now },
    { ...market, isResolved: true },
    { ...market, sportsAttentionReason: 'correction' },
  ])
    expect(golfMarketView(field, m, now)?.picks.every((p) => !p.buyable)).toBe(
      true
    )
  for (const f of [
    { ...field, readStartedAt: now + 1 },
    { ...field, readStartedAt: now - LIVE_STALE_MS },
    { ...field, incomplete: true },
    ...(['suspended', 'unavailable', 'final'] as const).map((state) => ({
      ...field,
      tournament: { ...field.tournament, state },
    })),
  ])
    expect(golfMarketView(f, market, now)?.picks.every((p) => !p.buyable)).toBe(
      true
    )
  expect(
    golfMarketView(
      { ...field, readStartedAt: now - LIVE_STALE_MS + 1 },
      market,
      now
    )?.picks.every((p) => p.buyable)
  ).toBe(true)
})
it('does not offer an individual golfer who withdrew, missed the cut, was disqualified or is absent', () => {
  for (const state of [
    'withdrawn',
    'cut',
    'disqualified',
    'unknown',
  ] as const) {
    const f = {
      ...field,
      players: [field.players[0], { ...field.players[1], state }],
    }
    expect(
      golfMarketView(f, market, now)?.picks.find((p) => p.playerId === 1)
        ?.buyable
    ).toBe(false)
  }
  const f = {
    ...field,
    players: field.players.map((p) => ({ ...p, fieldPresent: false })),
  }
  expect(
    golfMarketView(f, market, now)?.picks.find((p) => p.playerId === 2)?.buyable
  ).toBe(false)
})

it('holds Other when every eligible golfer already has a named answer', () => {
  const pick = golfMarketView(field, market, now)!.picks.find(
    (p) => p.playerId === null
  )!
  for (const player of [
    undefined,
    { ...field.players[2], state: 'withdrawn' as const },
    { ...field.players[2], fieldPresent: false },
  ]) {
    const players = field.players.slice(0, 2)
    if (player) players.push(player)
    const current = { ...field, players }
    expect(currentGolfPick(current, market, pick, now)).toBeUndefined()
    const choices = golfMarketView(current, market, now)!.picks
    expect(choices.map((p) => p.buyable)).toEqual([true, true, false])
  }
  expect(currentGolfPick(field, market, pick, now)).toEqual(pick)
})
