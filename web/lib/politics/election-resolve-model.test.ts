import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BinaryContract, Contract } from 'common/contract'
import { MIDTERMS_2026 } from 'web/public/data/elections-data'
import {
  baselineFor,
  biggestMovers,
  buildSummary,
  buildUnits,
  isStale,
  MapSource,
  mapSources,
  resolveCall,
  snapshotOf,
  sortUnits,
  unitFingerprint,
  withResolvedOdds,
} from './election-resolve-model'

// A pool whose CPMM price at p = 0.5 is `prob`.
const pool = (prob: number) => ({ YES: 1 - prob, NO: prob })

const binary = (id: string, prob: number, extra: object = {}) =>
  ({
    id,
    slug: `slug-${id}`,
    question: `Question ${id}?`,
    creatorUsername: 'someone',
    outcomeType: 'BINARY',
    mechanism: 'cpmm-1',
    pool: pool(prob),
    p: 0.5,
    ...extra,
  } as unknown as Contract)

const answer = (id: string, text: string, prob: number, extra: object = {}) => {
  const { YES, NO } = pool(prob)
  return { id, text, poolYes: YES, poolNo: NO, p: 0.5, prob, ...extra }
}

const multi = (
  id: string,
  sumsToOne: boolean,
  answers: ReturnType<typeof answer>[],
  extra: object = {}
) =>
  ({
    id,
    slug: `slug-${id}`,
    question: `Question ${id}?`,
    creatorUsername: 'someone',
    outcomeType: 'MULTIPLE_CHOICE',
    mechanism: 'cpmm-multi-2',
    shouldAnswersSumToOne: sumsToOne,
    answers,
    ...extra,
  } as unknown as Contract)

const bySlug = (cs: Contract[]) => Object.fromEntries(cs.map((c) => [c.slug, c]))
const byId = (cs: Contract[]) => Object.fromEntries(cs.map((c) => [c.id, c]))

const senateBinary = binary('S1', 0.9)
const governor = multi('G1', true, [
  answer('gd', 'Democratic Party', 0.3),
  answer('gr', 'Republican Party', 0.65),
  answer('go', 'Other', 0.05),
  answer('gx', 'Withdrawn', 0, { resolution: 'CANCEL' }),
])
const portfolio = multi('P1', false, [
  answer('pa', 'Prop A', 0.97),
  answer('pb', 'Prop B', 0.2),
  answer('pc', 'Prop C', 0.6, { resolution: 'YES' }),
])

const sources: MapSource[] = [
  { office: 'senate', race: 'TX Senate', ref: { slug: 'slug-S1' } },
  { office: 'governor', race: 'TX Governor', ref: { slug: 'slug-G1' } },
  { office: 'measure', race: 'CA Prop A', ref: { id: 'P1' }, answerId: 'pa' },
  { office: 'measure', race: 'CA Prop B', ref: { id: 'P1' }, answerId: 'pb' },
  { office: 'senate', race: 'missing', ref: { slug: 'nope' } },
]
const contracts = [senateBinary, governor, portfolio]
const units = buildUnits(sources, bySlug(contracts), byId(contracts))
const unit = (key: string) => {
  const u = units.find((x) => x.key === key)
  assert.ok(u, `no unit ${key}`)
  return u
}

test('a binary market is one YES/NO unit led by its price', () => {
  const u = unit('S1')
  assert.equal(u.kind, 'binary')
  assert.equal(u.leader.value, 'YES')
  assert.ok(Math.abs(u.leader.prob - 0.9) < 1e-9)
  assert.equal(u.race, 'TX Senate')
  assert.equal(u.url, '/someone/slug-S1')
})

test('a linked multi-choice market is one unit over its live answers', () => {
  const u = unit('G1')
  assert.equal(u.kind, 'choose-one')
  assert.deepEqual(
    u.options.map((o) => o.value),
    ['gd', 'gr', 'go']
  )
  assert.equal(u.leader.value, 'gr')
})

test('an independent portfolio is one unit per answer, labelled by the measure that names it', () => {
  assert.equal(unit('P1:pa').race, 'CA Prop A')
  assert.equal(unit('P1:pb').race, 'CA Prop B')
  assert.equal(unit('P1:pb').leader.value, 'NO')
  // Not named by any measure source: the portfolio label.
  assert.equal(unit('P1:pc').race, 'Measure portfolio')
  assert.equal(unit('P1:pc').resolved, true)
  // The contract is listed twice but its units appear once.
  assert.equal(units.filter((u) => u.contractId === 'P1').length, 3)
  // A source whose market is missing yields nothing.
  assert.equal(units.length, 5)
})

test('resolveCall builds the exact API body for each unit kind', () => {
  assert.deepEqual(resolveCall(unit('S1'), 'NO'), {
    contractId: 'S1',
    outcome: 'NO',
  })
  assert.deepEqual(resolveCall(unit('G1'), 'gr'), {
    contractId: 'G1',
    outcome: 'CHOOSE_ONE',
    answerId: 'gr',
  })
  assert.deepEqual(resolveCall(unit('P1:pa'), 'YES'), {
    contractId: 'P1',
    outcome: 'YES',
    answerId: 'pa',
  })
})

test('resolveCall refuses outcomes a unit does not offer', () => {
  assert.throws(() => resolveCall(unit('S1'), 'MKT'))
  assert.throws(() => resolveCall(unit('S1'), 'gr'))
  assert.throws(() => resolveCall(unit('G1'), 'YES'))
  // A cancelled answer is not a winner.
  assert.throws(() => resolveCall(unit('G1'), 'gx'))
  assert.throws(() => resolveCall(unit('P1:pa'), 'pa'))
})

test('sortUnits orders by the leader’s chance', () => {
  const desc = sortUnits(units, 'chance-desc').map((u) => u.key)
  assert.equal(desc[0], 'P1:pc') // resolved YES reads 100%
  assert.equal(desc[1], 'P1:pa')
  const asc = sortUnits(units, 'chance-asc').map((u) => u.key)
  assert.equal(asc[0], 'G1') // Republican Party at 65%
})

test('movers compare the leader with the snapshot from the window', () => {
  const t0 = 1_000_000
  const earlier = buildUnits(
    sources,
    bySlug([binary('S1', 0.6), governor, portfolio]),
    byId([binary('S1', 0.6), governor, portfolio])
  )
  const history = [snapshotOf(earlier, t0), snapshotOf(units, t0 + 600_000)]
  const baseline = baselineFor(history, t0 + 600_000, 600_000)
  assert.equal(baseline?.t, t0)
  const movers = biggestMovers(units, baseline, 3)
  assert.equal(movers.length, 1)
  assert.equal(movers[0].unit.key, 'S1')
  assert.ok(Math.abs(movers[0].from - 0.6) < 1e-9)
  // With too little history, the oldest snapshot stands in.
  assert.equal(baselineFor(history, t0 + 60_000, 600_000)?.t, t0)
})

test('buildSummary reports control from the leader’s side and its change', () => {
  const text = buildSummary(
    {
      now: Date.UTC(2026, 10, 4, 2, 30),
      baseline: {
        t: Date.UTC(2026, 10, 4, 2, 20),
        probs: { 'SC|YES': 0.6, 'HC|YES': 0.45 },
      },
      senateRep: 0.7,
      houseRep: 0.4,
      called: { senate: { called: 3, dem: 1, rep: 2, other: 0 } },
      movers: [],
    },
    { senateControl: 'SC', houseControl: 'HC' }
  )
  assert.match(text, /9:30 PM ET/)
  assert.match(text, /Senate: R 70% to control \(\+10\)/)
  // House: D leads at 60%, up 5 from 55%.
  assert.match(text, /House: D 60% to control \(\+5\)/)
  assert.match(text, /Resolved so far: Senate 3 \(D 1, R 2\)/)
  assert.match(text, /manifold\.markets\/election$/)
})

test('withResolvedOdds reads a resolved binary as its result', () => {
  // The backend keeps the pre-resolution price in resolutionProbability.
  const resolvedNo = binary('X', 0.9, {
    resolution: 'NO',
    resolutionProbability: 0.9,
  })
  assert.equal(
    (withResolvedOdds(resolvedNo) as BinaryContract).resolutionProbability,
    0
  )
  const resolvedYes = binary('X', 0.1, {
    resolution: 'YES',
    resolutionProbability: 0.1,
  })
  assert.equal(
    (withResolvedOdds(resolvedYes) as BinaryContract).resolutionProbability,
    1
  )
  const open = binary('X', 0.4)
  assert.equal(withResolvedOdds(open), open)
})

test('a resolved linked market reads its winner, not its last prices', () => {
  // resolveMarketHelper sets the contract's resolution but not each answer's.
  const byAnswerId = multi(
    'G2',
    true,
    [answer('d', 'Democratic Party', 0.2), answer('r', 'Republican Party', 0.8)],
    { resolution: 'd', isResolved: true }
  )
  const [u] = buildUnits(
    [{ office: 'governor', race: 'TX Governor', ref: { id: 'G2' } }],
    {},
    { G2: byAnswerId }
  )
  assert.equal(u.resolved, true)
  assert.equal(u.resolutionLabel, 'Democratic Party')
  assert.equal(u.leader.value, 'd')
  assert.equal(u.leader.prob, 1)

  const byMap = multi(
    'G3',
    true,
    [answer('d', 'Democratic Party', 0.7), answer('r', 'Republican Party', 0.3)],
    { resolution: 'MKT', resolutions: { r: 100 }, isResolved: true }
  )
  const [m] = buildUnits(
    [{ office: 'governor', race: 'OH Governor', ref: { id: 'G3' } }],
    {},
    { G3: byMap }
  )
  assert.equal(m.resolutionLabel, 'Republican Party')
  assert.equal(m.leader.value, 'r')
})

test('a selection goes stale when its question or answer is edited', () => {
  const before = unit('P1:pa')
  const choice = { value: 'YES', fingerprint: unitFingerprint(before, 'YES') }
  assert.equal(isStale(before, choice), false)
  const edited = buildUnits(
    sources,
    bySlug(contracts),
    byId([
      senateBinary,
      governor,
      multi('P1', false, [
        answer('pa', 'Prop A2', 0.97),
        answer('pb', 'Prop B', 0.2),
        answer('pc', 'Prop C', 0.6, { resolution: 'YES' }),
      ]),
    ])
  ).find((u) => u.key === 'P1:pa')
  assert.ok(edited)
  assert.equal(isStale(edited, choice), true)
})

test('the House district portfolio files under House', () => {
  const s = mapSources().find(
    (x) => 'slug' in x.ref && x.ref.slug === MIDTERMS_2026.houseDistricts
  )
  assert.equal(s?.office, 'house')
  assert.equal(
    mapSources().filter((x) => x.office === 'headline').length,
    3
  )
})

test('a resolved chamber reads as resolved, not as a price', () => {
  const text = buildSummary(
    {
      now: Date.UTC(2026, 10, 4, 5, 0),
      senateRep: 1,
      senateResolved: true,
      called: {},
      movers: [],
    },
    { senateControl: 'SC' }
  )
  assert.match(text, /Senate: R control, resolved on Manifold/)
})
