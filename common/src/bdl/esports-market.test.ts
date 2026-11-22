import { LIVE_STALE_MS } from '../sports-schedule'
import { MANIFOLD_SPORTS_USER_IDS } from '../sports'
import {
  esportsPicks,
  sameEsportsPick,
  type EsportsMarket,
  type EsportsSeriesView,
} from './esports-market'
import { readEsportsSeries } from './esports-series'

const now = 2000000000000
const teams = [
  { id: 35, name: 'Crimson Club' },
  { id: 74, name: 'Blue Club' },
]
function sample(): EsportsSeriesView & { market: EsportsMarket } {
  const s = readEsportsSeries('cs', {
    id: 91,
    team1: teams[0],
    team2: teams[1],
    best_of: 3,
    tournament: { id: 42, name: 'Cup', tier: 's' },
    status_state: 'in_progress',
    team1_score: 1,
    team2_score: 0,
  })
  if (!s) throw Error('Test series')
  return {
    series: s,
    observedAt: now - 100,
    marketReadAt: now - 1,
    market: {
      id: 'm1',
      creatorId: MANIFOLD_SPORTS_USER_IDS[0],
      sportsProvider: 'bdl',
      sportsLeagueKey: 'cs',
      sportsEventId: s.eventId,
      sportsMarketType: 'moneyline',
      sportsEntrantIds: [35, 74],
      visibility: 'public',
      token: 'MANA',
      mechanism: 'cpmm-multi-2',
      outcomeType: 'MULTIPLE_CHOICE',
      addAnswersMode: 'DISABLED',
      shouldAnswersSumToOne: true,
      isResolved: false,
      closeTime: now + 8000,
      answers: teams.map((t, index) => ({
        text: t.name,
        contractId: 'm1',
        id: 'a' + index,
        index,
        p: 0.5,
        poolYes: index ? 60 : 40,
        poolNo: index ? 40 : 60,
      })),
    },
  }
}
test('aligns map sides to stable entrant IDs, current native pool prices and native first-answer execution orientation', () => {
  const row = sample()
  const picks = esportsPicks(row, now)
  expect(picks).toMatchObject([
    {
      name: 'Crimson Club',
      entrantId: 35,
      answerId: 'a0',
      nativeSide: 'YES',
      probability: 0.6,
    },
    {
      name: 'Blue Club',
      entrantId: 74,
      answerId: 'a1',
      nativeSide: 'NO',
      probability: 0.4,
    },
  ])
  const reversed = esportsPicks(
    {
      ...row,
      market: { ...row.market, answers: [...row.market.answers].reverse() },
    },
    now
  )
  expect(reversed).toMatchObject([
    { entrantId: 35, answerId: 'a0', nativeSide: 'NO', probability: 0.6 },
    { entrantId: 74, answerId: 'a1', nativeSide: 'YES', probability: 0.4 },
  ])
  expect(sameEsportsPick(picks[0], reversed[0])).toBe(false)
  expect(sameEsportsPick(picks[0], { ...picks[0], probability: 0.75 })).toBe(
    true
  )
})
test.each([
  ['observedAt', now - LIVE_STALE_MS],
  ['marketReadAt', now - LIVE_STALE_MS],
  ['observedAt', now + 1],
  ['marketReadAt', NaN],
  ['marketReadAt', undefined],
  ['observedAt', null],
] as const)('%s independently needs a current receipt %s', (field, value) => {
  expect(esportsPicks({ ...sample(), [field]: value }, now)).toEqual([])
})
test.each([
  { creatorId: 'user' },
  { sportsFixture: true },
  { sportsProvider: 'odds' },
  { sportsMarketType: 'champion' },
  { sportsLeagueKey: 'lol' },
  { sportsEventId: 'bdl:cs:92' },
  { visibility: 'unlisted' },
  { visibility: 'private' },
  { token: 'CASH' },
  { deleted: true },
  { resolution: 'CANCEL' },
  { isResolved: true },
  { sportsAttentionReason: 'review' },
  { mechanism: 'cpmm-1' },
  { outcomeType: 'BINARY' },
  { addAnswersMode: 'ANYONE' },
  { shouldAnswersSumToOne: false },
  { closeTime: now },
  { closeTime: NaN },
  { sportsEntrantIds: [74, 35] },
  { sportsEntrantIds: [35, 35] },
  { answers: [] },
] as const)('market eligibility %#', (changes) => {
  const row = sample()
  expect(
    esportsPicks(
      { ...row, market: { ...row.market, ...changes } as EsportsMarket },
      now
    )
  ).toEqual([])
})
test.each([
  { index: 1 },
  { contractId: 'm2' },
  { id: 'a1' },
  { text: 'Blue Club' },
  { isOther: true },
  { resolution: 'NO' },
  { resolutionTime: now },
  { poolNo: -1 },
  { poolYes: NaN },
  { p: 1 },
  { poolYes: 55 },
] as const)('both answers independently verify %#', (change) => {
  const row = sample(),
    [a, b] = row.market.answers
  expect(
    esportsPicks(
      { ...row, market: { ...row.market, answers: [{ ...a, ...change }, b] } },
      now
    )
  ).toEqual([])
})
test('cap remains static; normalized natural labels and strictly fresh boundary accepted', () => {
  const row = sample(),
    [a, b] = row.market.answers
  const picks = esportsPicks(
    {
      ...row,
      observedAt: now - LIVE_STALE_MS + 1,
      market: {
        ...row.market,
        answers: [
          { ...a, text: ' CRIMSON  Club ', poolYes: 1, poolNo: 99 },
          { ...b, poolYes: 99, poolNo: 1 },
        ],
      },
    },
    now
  )
  expect(picks).toMatchObject([
    { entrantId: 35, probability: 0.99, buyable: false },
    { entrantId: 74, buyable: true },
  ])
})
test('event review, wrong match, missing identities and unsupported scope never expose selections', () => {
  const row = sample()
  expect(esportsPicks({ ...row, market: undefined }, now)).toEqual([])
  for (const changes of [
    { tier: 'a' },
    { skipBestOfTwo: true },
    { review: 'forfeit' } as const,
    { id: 92 },
    { id: 0 },
    { team1: null },
    { team2: row.series.team1 },
    { status: 'final' } as const,
  ]) {
    expect(
      esportsPicks({ ...row, series: { ...row.series, ...changes } }, now)
    ).toEqual([])
  }
})
