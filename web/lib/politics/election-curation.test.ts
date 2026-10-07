import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Contract } from 'common/contract'
import {
  balanceOfPowerAnswerColor,
  BOP_COLORS,
  curateTrendingMarkets,
  getHeadlineOdds,
  isFederalOrGubernatorialElectionMarket,
  rankContestMarkets,
} from './election-curation'

const NOW = Date.UTC(2026, 9, 6)
const DAY = 24 * 60 * 60 * 1000

let n = 0
function market(overrides: Record<string, unknown> = {}) {
  n++
  return {
    id: `m${n}`,
    slug: `market-${n}`,
    question: `Will a Democrat win the Senate race ${n}?`,
    creatorId: `creator-${n}`,
    visibility: 'public',
    mechanism: 'cpmm-1',
    outcomeType: 'BINARY',
    isResolved: false,
    closeTime: NOW + 30 * DAY,
    uniqueBettorCount: 20,
    volume: 1000,
    volume24Hours: 100,
    pool: { YES: 100, NO: 100 },
    p: 0.5,
    prob: 0.5,
    ...overrides,
  } as unknown as Contract
}

test('rankContestMarkets: traders first, then 24h volume, then volume', () => {
  const a = market({ uniqueBettorCount: 12, volume24Hours: 0 })
  const b = market({ uniqueBettorCount: 12, volume24Hours: 775 })
  const c = market({ uniqueBettorCount: 8, volume24Hours: 670 })
  const d = market({ uniqueBettorCount: 7, volume24Hours: 35, volume: 50 })
  const e = market({ uniqueBettorCount: 7, volume24Hours: 35, volume: 900 })
  const ranked = rankContestMarkets([a, c, d, e, b], { now: NOW, limit: 4 })
  assert.deepEqual(
    ranked.map((m) => m.id),
    [b.id, a.id, c.id, e.id]
  )
})

test('rankContestMarkets: drops resolved, closed, private, deleted and duplicates', () => {
  const ok = market()
  const resolved = market({ isResolved: true, resolution: 'YES' })
  const closed = market({ closeTime: NOW - 1 })
  const unlisted = market({ visibility: 'unlisted' })
  const deleted = market({ deleted: true })
  const ranked = rankContestMarkets(
    [ok, resolved, closed, unlisted, deleted, ok],
    { now: NOW, limit: 8 }
  )
  assert.deepEqual(
    ranked.map((m) => m.id),
    [ok.id]
  )
})

test('isFederalOrGubernatorialElectionMarket', () => {
  const yes = [
    'Will Republicans maintain control of the US Senate following the 2026 midterm elections?',
    'Will Democrats win 53 seats or more in the 2026 Senate elections?',
    'Who will win the 2026 Montana senate election?',
    '2026 Kansas Governor election winner?',
    'Will there be a significant polling error at the 2026 US midterm elections?',
    "Will a Democrat win Alabama's 2nd congressional district in 2026?",
  ]
  const no = [
    'Will Democrats win Indiana State Senate District 1 in 2026?',
    'Trump cut a check as tariff rebate before midterms?',
    'Will Georgia Amendment 3 (Next Generation 9-1-1 Fund) be approved in the November election?',
    'Will Colorado Proposition 136 (4.4% income tax rate cap) be approved in the November 2026 election?',
    'Who will win the 2026 New York City mayoral election?',
  ]
  for (const q of yes)
    assert.equal(
      isFederalOrGubernatorialElectionMarket({ question: q }),
      true,
      q
    )
  for (const q of no)
    assert.equal(
      isFederalOrGubernatorialElectionMarket({ question: q }),
      false,
      q
    )
})

test('curateTrendingMarkets: min traders, exclusions, creator cap, order kept', () => {
  const thin = market({ uniqueBettorCount: 3 })
  const stateLeg = market({
    question: 'Will Democrats win Indiana State Senate District 1 in 2026?',
  })
  const contest = market()
  const hero = market({ slug: 'republicans-have-house-majority-aft' })
  const j1 = market({ creatorId: 'jack' })
  const j2 = market({ creatorId: 'jack' })
  const j3 = market({ creatorId: 'jack' })
  const other = market()
  const picked = curateTrendingMarkets(
    [thin, stateLeg, contest, hero, j1, j2, j3, other],
    {
      now: NOW,
      excludeIds: [contest.id],
      excludeSlugs: ['republicans-have-house-majority-aft'],
    }
  )
  assert.deepEqual(
    picked.map((m) => m.id),
    [j1.id, j2.id, other.id]
  )
})

test('curateTrendingMarkets: respects the limit', () => {
  const many = Array.from({ length: 15 }, () => market())
  assert.equal(curateTrendingMarkets(many, { now: NOW }).length, 10)
  assert.equal(curateTrendingMarkets(many, { now: NOW, limit: 4 }).length, 4)
})

test('getHeadlineOdds: binary shows its chance', () => {
  const odds = getHeadlineOdds(market())
  assert.equal(odds?.kind, 'binary')
  assert.ok(odds && Math.abs(odds.prob - 0.5) < 1e-9)
})

test('getHeadlineOdds: multiple choice shows the leader and its percent', () => {
  const multi = market({
    mechanism: 'cpmm-multi-1',
    outcomeType: 'MULTIPLE_CHOICE',
    shouldAnswersSumToOne: false,
    answers: [
      { id: 'a1', text: 'Ohio', prob: 0.4, poolYes: 60, poolNo: 40 },
      { id: 'a2', text: 'Michigan', prob: 0.85, poolYes: 15, poolNo: 85 },
      {
        id: 'a3',
        text: 'Maine',
        prob: 1,
        poolYes: 1,
        poolNo: 99,
        resolution: 'YES',
      },
    ],
  })
  const odds = getHeadlineOdds(multi)
  assert.equal(odds?.kind, 'multi')
  if (odds?.kind !== 'multi') return
  // Resolved answers are not the "leading" live answer.
  assert.equal(odds.answer, 'Michigan')
  assert.ok(Number.isFinite(odds.prob) && odds.prob > 0.5)
})

test('getHeadlineOdds: nothing to show for a multi with no live answers', () => {
  const empty = market({
    mechanism: 'cpmm-multi-1',
    outcomeType: 'MULTIPLE_CHOICE',
    shouldAnswersSumToOne: true,
    answers: [],
  })
  assert.equal(getHeadlineOdds(empty), undefined)
})

test('balanceOfPowerAnswerColor maps each outcome by meaning', () => {
  // The live PREDYX market's answer labels.
  assert.equal(
    balanceOfPowerAnswerColor('Democrats Sweep'),
    BOP_COLORS.demSweep
  )
  assert.equal(
    balanceOfPowerAnswerColor('Republicans Sweep'),
    BOP_COLORS.repSweep
  )
  assert.equal(
    balanceOfPowerAnswerColor('D Senate, R House'),
    BOP_COLORS.demSenateRepHouse
  )
  assert.equal(
    balanceOfPowerAnswerColor('R Senate, D House'),
    BOP_COLORS.repSenateDemHouse
  )
  assert.equal(balanceOfPowerAnswerColor('Other'), BOP_COLORS.other)
  // Reordered or spelled-out variants.
  assert.equal(
    balanceOfPowerAnswerColor('House: Democratic, Senate: Republican'),
    BOP_COLORS.repSenateDemHouse
  )
  assert.equal(
    balanceOfPowerAnswerColor('Republican Senate, Democratic House'),
    BOP_COLORS.repSenateDemHouse
  )
  // The two splits are distinct from each other and from both sweeps.
  const colors = [
    BOP_COLORS.demSweep,
    BOP_COLORS.repSweep,
    BOP_COLORS.demSenateRepHouse,
    BOP_COLORS.repSenateDemHouse,
  ]
  assert.equal(new Set(colors).size, colors.length)
})
