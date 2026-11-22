import { LIVE_STALE_MS } from '../sports-schedule'
import type { Answer } from '../answer'
import type { Contract } from '../contract'
import { MANIFOLD_SPORTS_USER_IDS } from '../sports'
import { bdlHeadToHeadEventId } from '../sports-ids'
import { type UfcBout, type UfcCard, UFC_DRAW_ANSWER } from './ufc'
import {
  filterUfcCards,
  groupUfcCards,
  toUfcMarketBout,
  ufcCanBet,
  ufcCardDisplay,
  ufcMarketObservation,
  type UfcMarketBout,
} from './ufc-card'

const card: UfcCard = {
  id: 5,
  name: 'UFC fixture',
  date: '2026-11-21',
  starts: { main_card: 100 },
}
const bout: UfcBout = {
  id: 77,
  eventId: bdlHeadToHeadEventId('mma', 77, 20, 10),
  cardId: 5,
  fighters: [
    { id: 20, name: 'River' },
    { id: 10, name: 'Vale' },
  ],
  segment: 'main_card',
  order: 1,
  scheduledRounds: 5,
  headline: true,
  titleFight: false,
  status: 'scheduled',
  winnerId: null,
  method: null,
  methodDetail: null,
  resultRound: null,
  resultTime: null,
}
const observation = ufcMarketObservation(card, bout, 120, null)
const raw = {
  id: 'ufc77',
  slug: 'river-vale',
  creatorUsername: 'ManifoldSports',
  creatorId: MANIFOLD_SPORTS_USER_IDS[0],
  sportsProvider: 'bdl',
  sportsLeagueKey: 'mma',
  sportsLeague: 'MMA',
  sportsMarketType: 'moneyline',
  sportsEventId: bout.eventId,
  sportsHomeTeam: 'River',
  sportsAwayTeam: 'Vale',
  sportsEntrantIds: [20, 10, null],
  sportsUfc: observation,
  outcomeType: 'MULTIPLE_CHOICE',
  mechanism: 'cpmm-multi-2',
  addAnswersMode: 'DISABLED',
  shouldAnswersSumToOne: true,
  token: 'MANA',
  visibility: 'public',
  closeTime: 800,
}
const answers = [
  { id: 'r', text: 'River', prob: 0.58 },
  { id: 'v', text: 'Vale', prob: 0.4 },
  { id: 'd', text: UFC_DRAW_ANSWER, prob: 0.02 },
].map((a, index) => ({ ...a, contractId: 'ufc77', index })) as Answer[]
function market(patch = {}, picks = answers) {
  return toUfcMarketBout({ ...raw, ...patch } as unknown as Contract, picks)
}
beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(400)
})
afterEach(() => jest.restoreAllMocks())
const row = market()!
const stamp = (id: number, patch: Partial<UfcMarketBout>): UfcMarketBout => ({
  ...row,
  id: 'm' + id,
  fightId: id,
  ...patch,
})
test('uses native stable answer ids, proper market permissions and UFC-only identity', () => {
  expect(row.answers.map((a) => [a.fighterId, a.answerId, a.prob])).toEqual([
    [20, 'r', 0.58],
    [10, 'v', 0.4],
    [null, 'd', 0.02],
  ])
  for (const patch of [
    { visibility: 'unlisted' },
    { creatorId: 'fan' },
    { token: 'CASH' },
    { deleted: true },
    { sportsFixture: true },
    { sportsLeagueKey: 'atp' },
    { sportsEntrantIds: [10, 10, null] },
    { sportsMarketType: 'method' },
    { resolution: 'CANCEL' },
    { sportsHomeTeam: 'Vale' },
  ])
    expect(market(patch)).toBeNull()
  expect(market({}, answers.slice(0, 2))).toBeNull()
  expect(
    market({}, [
      ...answers.slice(0, 2),
      { ...answers[2], contractId: 'another' },
    ])
  ).toBeNull()
})
test('a matching final and stable winner label receive a check, irregular and unresolved sporting outcomes stay neutral', () => {
  const end = {
    ...bout,
    status: 'final' as const,
    method: 'Decision',
    winnerId: 10,
  }
  const win = ufcMarketObservation(card, end, 300, observation)
  expect(win).toMatchObject({
    firstFinalAt: 300,
    lastNonfinalAt: 120,
    winner: 10,
  })
  expect(market({ sportsUfc: win })?.winnerAnswerId).toBe('v')
  expect(market({ sportsUfc: win, resolution: 'r' })?.winnerAnswerId).toBeNull()
  const paid = answers.map((a) => ({
    ...a,
    resolution: a.id === 'v' ? ('YES' as const) : ('NO' as const),
  }))
  expect(
    market({ sportsUfc: win, resolution: 'MKT' }, paid)?.winnerAnswerId
  ).toBe('v')
  expect(
    market({ sportsUfc: win, resolution: 'r' }, paid)?.winnerAnswerId
  ).toBeNull()
  expect(
    market({ sportsUfc: win, resolution: 'MKT' }, [
      ...paid.slice(0, 2),
      { ...paid[2], resolution: 'YES' },
    ])?.winnerAnswerId
  ).toBeNull()
  const neutral = ufcMarketObservation(
    card,
    { ...end, winnerId: null, method: 'No Contest' },
    310,
    win
  )
  expect(market({ sportsUfc: neutral })?.winnerAnswerId).toBe('d')
  expect(
    ufcMarketObservation(card, { ...end, method: 'Draw' }, 310, win).winner
  ).toBeNull()
  expect(
    ufcMarketObservation(card, { ...end, winnerId: 50 }, 310, win).winner
  ).toBeNull()
  expect(ufcMarketObservation(card, bout, 299, win)).toBe(win)
  expect(ufcMarketObservation(card, bout, 310, win)).toMatchObject({
    winner: null,
    firstFinalAt: null,
    lastNonfinalAt: 310,
  })
})
test('last-result chronology uses disjoint observation intervals rather than mutable fight order', () => {
  const first = stamp(1, {
    status: 'final',
    order: 7,
    firstFinalAt: 200,
    lastNonfinalAt: 150,
    observedAt: 400,
  })
  const last = stamp(2, {
    status: 'final',
    order: 5,
    firstFinalAt: 300,
    lastNonfinalAt: 270,
    observedAt: 400,
  })
  const future = stamp(3, { order: 1 })
  for (const order of [1, 6]) {
    const view = ufcCardDisplay([last, { ...first, order }, future])
    expect(view.recent).toEqual(last)
    expect(view.confirmedLast).toBe(true)
    expect(view.next).toBeUndefined()
  }
  for (const patch of [
    { lastNonfinalAt: 199 },
    { firstFinalAt: 200, lastNonfinalAt: 190 },
    { firstFinalAt: null },
    { lastNonfinalAt: null },
  ]) {
    expect(
      ufcCardDisplay([first, { ...last, ...patch }, future]).confirmedLast
    ).toBe(false)
  }
  expect(ufcCardDisplay([future]).recent).toBeUndefined()
  expect(ufcCardDisplay([first, last]).completed).toHaveLength(2)
  expect(
    ufcCardDisplay([first, { ...future, onlyRemaining: true }]).next?.id
  ).toBe(future.id)
  const live = { ...future, status: 'in_progress' as const }
  expect(ufcCardDisplay([first, live]).live).toBe(live)
  expect(
    ufcCardDisplay([live, { ...live, id: 'another' }]).live
  ).toBeUndefined()
})
test('private markets cannot contribute a result, a sole remaining bout, or a headline to the visible card', () => {
  const latest = ufcMarketObservation(
    card,
    { ...bout, status: 'final', winnerId: 10, method: 'Decision' },
    500,
    observation
  )
  expect(market({ visibility: 'private', sportsUfc: latest })).toBeNull()
  const first = stamp(1, {
    status: 'final',
    lastNonfinalAt: 150,
    firstFinalAt: 200,
    observedAt: 400,
    headline: false,
  })
  const competing = stamp(2, {
    status: 'final',
    lastNonfinalAt: 180,
    firstFinalAt: 200,
    observedAt: 400,
    headline: false,
  })
  const future = stamp(3, {
    status: 'scheduled',
    onlyRemaining: false,
    headline: false,
  })
  const [shown] = groupUfcCards([first, competing, future])
  const view = ufcCardDisplay(shown.bouts)
  expect(view.confirmedLast).toBe(false)
  expect(view.recent).toBeDefined()
  expect(view.next).toBeUndefined()
  expect(shown.bouts.some((b) => b.headline)).toBe(false)
  const published = ufcCardDisplay([first, future])
  expect(published.recent?.id).toBe(first.id)
  expect(published.confirmedLast).toBe(true)
})

test('filtering preserves partial-card provenance and in-play tickets use a real close time', () => {
  const next = stamp(2, { order: 2 })
  const cards = groupUfcCards([row, next])
  expect(cards[0].bouts.map((b) => b.fightId)).toEqual([2, 77])
  expect(filterUfcCards(cards, (b) => b.fightId === 2)[0].partial).toBe(true)
  expect(ufcCanBet({ ...row, status: 'in_progress' }, 799)).toBe(true)
  for (const b of [
    { ...row, status: 'final' as const },
    { ...row, isResolved: true },
    { ...row, closeTime: null },
  ])
    expect(ufcCanBet(b, 0)).toBe(false)
  expect(ufcCanBet(row, 800)).toBe(false)
})

test('only the observed canonical fight and unordered pair can control results and chronology', () => {
  const replacement = {
    ...bout,
    eventId: bdlHeadToHeadEventId('mma', 77, 20, 30),
    fighters: [
      bout.fighters[0],
      { id: 30, name: 'Pine' },
    ] as UfcBout['fighters'],
  }
  const replaced = ufcMarketObservation(
    card,
    { ...replacement, status: 'final', method: 'Decision', winnerId: 20 },
    300,
    observation
  )
  expect(replaced.lastNonfinalAt).toBeNull()
  expect(market({ sportsUfc: replaced })).toBeNull()
  expect(
    market({ sportsUfc: { ...observation, observedEventId: undefined } })
  ).toBeNull()
  expect(
    ufcMarketObservation(
      card,
      {
        ...bout,
        fighters: [bout.fighters[1], bout.fighters[0]],
        status: 'final',
        method: 'Decision',
        winnerId: 10,
      },
      220,
      observation
    ).lastNonfinalAt
  ).toBe(120)
  expect(() =>
    ufcMarketObservation(
      card,
      { ...replacement, eventId: bout.eventId },
      300,
      null
    )
  ).toThrow()
})

test('contradictory results and stale or future observations cannot keep a pick live', () => {
  for (const patch of [
    { winnerId: 10 },
    { method: 'Submission' },
    { methodDetail: 'Draw' },
    { resultRound: 2 },
    { resultTime: '1:24' },
  ]) {
    const o = ufcMarketObservation(
      card,
      { ...bout, status: 'in_progress', ...patch },
      120,
      null
    )
    expect(o.status).toBe('unknown')
    expect(ufcCanBet(market({ sportsUfc: o })!, 121)).toBe(false)
  }
  const match = { ...row, status: 'in_progress' as const, closeTime: 10000000 }
  for (const t of [119, 120 + LIVE_STALE_MS, 120 + LIVE_STALE_MS + 1]) {
    expect(ufcCanBet(match, t)).toBe(false)
    expect(ufcCardDisplay([match], t).live).toBeUndefined()
    expect(
      ufcCardDisplay(
        [{ ...match, status: 'scheduled', onlyRemaining: true }],
        t
      ).next
    ).toBeUndefined()
  }
  expect(ufcCanBet(match, 120 + LIVE_STALE_MS - 1)).toBe(true)
  const later = {
    ...match,
    status: 'scheduled' as const,
    segmentStart: 120 + 2 * LIVE_STALE_MS,
  }
  expect(ufcCanBet(later, later.segmentStart - 1)).toBe(true)
  expect(ufcCanBet(later, later.segmentStart)).toBe(false)
  const final = ufcMarketObservation(
    card,
    {
      ...bout,
      status: 'final',
      method: 'Decision',
      methodDetail: 'Technical draw',
    },
    400,
    observation
  )
  expect(final).toMatchObject({
    winner: 'draw-or-no-contest',
    method: 'Technical draw',
  })
  expect(market({ sportsUfc: { ...final, winner: 20 } })).toBeNull()
  expect(
    market({ sportsUfc: { ...observation, roundTime: '1:24' } })
  ).toBeNull()
})

test('a single agreed native payout supports the winner; ambiguous or split payments do not', () => {
  const end = ufcMarketObservation(
    card,
    { ...bout, status: 'final', method: 'Decision', winnerId: 20 },
    300,
    observation
  )
  for (const resolutions of [{ r: 100 }, { r: 100, v: 0, d: 0 }])
    expect(
      market({ sportsUfc: end, resolution: 'MKT', resolutions })?.winnerAnswerId
    ).toBe('r')
  for (const resolutions of [
    { v: 100 },
    { r: 50, d: 50 },
    { r: 100, foreign: 0 },
    {},
  ])
    expect(
      market({ sportsUfc: end, resolution: 'MKT', resolutions })?.winnerAnswerId
    ).toBeNull()
  expect(
    market({ sportsUfc: end, resolution: 'MKT', resolutions: { r: 100 } }, [
      { ...answers[0], resolution: 'NO' },
      ...answers.slice(1),
    ])?.winnerAnswerId
  ).toBeNull()
  expect(
    market({ sportsUfc: end, isResolved: true })?.winnerAnswerId
  ).toBeNull()
})
test('late and simultaneous receipts cannot restore a replaced card or matchup', () => {
  const previous = {
    ...observation,
    observedAt: 200,
    cardId: 8,
    observedEventId: bdlHeadToHeadEventId('mma', 77, 10, 30),
  }
  for (const at of [199, 200])
    expect(ufcMarketObservation(card, bout, at, previous)).toBe(previous)
  expect(ufcMarketObservation(card, bout, 201, previous)).toMatchObject({
    observedEventId: bout.eventId,
    lastNonfinalAt: 201,
  })
})

test('an advance listing expires at its advertised start and a new scheduled receipt starts a new window', () => {
  const before = {
    ...row,
    observedAt: 1000,
    segmentStart: 1010,
    closeTime: 10000000,
  }
  for (const onlyRemaining of [true, false]) {
    expect(ufcCanBet({ ...before, onlyRemaining }, 1009)).toBe(true)
    expect(ufcCanBet({ ...before, onlyRemaining }, 1010)).toBe(false)
    expect(
      ufcCanBet({ ...before, observedAt: 1010, onlyRemaining }, 1011)
    ).toBe(true)
  }
  const sole = {
    ...before,
    onlyRemaining: true,
    segmentStart: 1000 + LIVE_STALE_MS * 2,
  }
  const [filtered] = filterUfcCards(
    groupUfcCards([sole, stamp(88, {})]),
    (b) => b.id === sole.id
  )
  expect(filtered.bouts[0].onlyRemaining).toBe(true)
  expect(ufcCanBet(filtered.bouts[0], 1000 + LIVE_STALE_MS)).toBe(false)
})

test('fighters and the neutral choice must have distinct displayed labels', () => {
  for (const [home, away] of [
    ['First Name', 'First  Name'],
    ['café', 'CAFE\u0301'],
    ['Draw or\u00a0no contest', 'River'],
  ]) {
    expect(
      market(
        { sportsHomeTeam: home, sportsAwayTeam: away },
        answers.map((a, i) => ({
          ...a,
          text: [home, away, UFC_DRAW_ANSWER][i],
        }))
      )
    ).toBeNull()
  }
})

test('specific decisions and impossible rounds cannot establish a paid winner', () => {
  const final = {
    ...bout,
    status: 'final' as const,
    method: 'Draw',
    methodDetail: 'Technical draw',
  }
  expect(ufcMarketObservation(card, final, 200, null).winner).toBe(
    'draw-or-no-contest'
  )
  expect(
    ufcMarketObservation(
      card,
      { ...final, method: 'Unanimous decision', methodDetail: 'Split draw' },
      200,
      null
    ).winner
  ).toBeNull()
  expect(
    ufcMarketObservation(
      card,
      { ...final, scheduledRounds: 3, resultRound: 4 },
      200,
      null
    ).winner
  ).toBeNull()
  const valid = ufcMarketObservation(
    card,
    { ...final, scheduledRounds: 3, resultRound: 3 },
    200,
    null
  )
  expect(market({ sportsUfc: { ...valid, round: 4 } })).toBeNull()
  expect(market({ sportsUfc: valid })?.winnerAnswerId).toBe('d')
})

test('round-roster contradictions survive every personal or topic filter', () => {
  const only = { ...row, onlyRemaining: true }
  const contradictory = stamp(88, { observedAt: 121 })
  const selected = filterUfcCards(
    groupUfcCards([only, contradictory]),
    (b) => b.id === only.id
  )
  expect(ufcCardDisplay(selected[0].bouts, 150).next).toBeUndefined()
  expect(
    ufcCardDisplay(
      filterUfcCards(groupUfcCards([only]), () => true)[0].bouts,
      150
    ).next?.id
  ).toBe(only.id)
})
