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
