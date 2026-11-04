import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BinaryContract, Contract } from 'common/contract'
import { MIDTERMS_2026 } from 'web/public/data/elections-data'
import {
  addTrades,
  buildUnits,
  checkBeforeResolve,
  leaderChange,
  movesSince,
  pricesAt,
  resolvedSince,
  seriesKey,
  TradeStore,
  freshUnit,
  isStale,
  MapSource,
  mapSources,
  resolveCall,
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
  answer('pc', 'Prop C', 0.6, { resolution: 'YES', resolutionTime: 500 }),
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

test('the run re-checks each unit against a fresh copy of its market', () => {
  const ticked = unit('P1:pa')
  const choice = { value: 'YES', fingerprint: unitFingerprint(ticked, 'YES') }
  const reread = (answers: ReturnType<typeof answer>[]) =>
    freshUnit(ticked, multi('P1', false, answers))
  // Unchanged: fine to resolve.
  assert.equal(
    checkBeforeResolve(reread([answer('pa', 'Prop A', 0.97)]), choice),
    undefined
  )
  // Edited while earlier units were resolving.
  assert.match(
    checkBeforeResolve(reread([answer('pa', 'Prop A2', 0.97)]), choice) ?? '',
    /Edited/
  )
  // Resolved by someone else meanwhile.
  assert.match(
    checkBeforeResolve(
      reread([answer('pa', 'Prop A', 0.97, { resolution: 'NO' })]),
      choice
    ) ?? '',
    /Already resolved/
  )
  // The answer is gone, or the wrong market came back.
  assert.match(checkBeforeResolve(reread([]), choice) ?? '', /no longer/)
  assert.equal(freshUnit(ticked, senateBinary), undefined)
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


// Trades: S1 YES was 0.6 at t=100 and 0.7 at t=300 (now 0.9). One bet
// group at t=150 moved G1's Republican from 0.4 and its Democrat from 0.55.
// P1's Prop B was 0.5 YES at t=150 (now 0.2).
const tradeStore = () => {
  const store: TradeStore = new Map()
  const seen = new Set<string>()
  addTrades(store, seen, [
    { contractId: 'S1', createdTime: 300, probBefore: 0.7 },
    { contractId: 'S1', createdTime: 100, probBefore: 0.6 },
    { contractId: 'P1', answerId: 'pb', createdTime: 150, probBefore: 0.5 },
  ])
  // Points rows carry no contract id; the caller supplies it.
  addTrades(
    store,
    seen,
    [
      { answerId: 'gr', createdTime: 150, probBefore: 0.4 },
      { answerId: 'gd', createdTime: 150, probBefore: 0.55 },
    ],
    'G1'
  )
  return { store, seen }
}

test('addTrades keeps each series sorted and skips rows it already has', () => {
  const { store, seen } = tradeStore()
  assert.deepEqual(
    store.get(seriesKey('S1'))?.map((t) => t.t),
    [100, 300]
  )
  assert.equal(
    addTrades(store, seen, [
      { contractId: 'S1', createdTime: 100, probBefore: 0.6 },
    ]),
    0
  )
  assert.equal(store.get(seriesKey('S1'))?.length, 2)
  assert.ok(store.get(seriesKey('G1', 'gr')))
})

test('a price at a moment is the first trade after it, else unchanged', () => {
  const { store } = tradeStore()
  assert.deepEqual(pricesAt(unit('S1'), store, 50), { YES: 0.6, NO: 0.4 })
  const at200 = pricesAt(unit('S1'), store, 200)
  assert.equal(at200.YES, 0.7)
  assert.ok(Math.abs(at200.NO - 0.3) < 1e-9)
  // Nothing traded after 400: still at today's price.
  assert.ok(Math.abs(pricesAt(unit('S1'), store, 400).YES - 0.9) < 1e-9)
  const g = pricesAt(unit('G1'), store, 50)
  assert.equal(g.gr, 0.4)
  assert.equal(g.gd, 0.55)
  // Other never traded in the window.
  assert.ok(Math.abs(g.go - 0.05) < 1e-9)
})

test('movesSince reports what rose most in each unit, biggest first', () => {
  const { store } = tradeStore()
  const moves = movesSince(units, store, 50)
  const byKey = Object.fromEntries(moves.map((m) => [m.unit.key, m]))
  assert.equal(byKey.S1.option.value, 'YES')
  assert.ok(Math.abs(byKey.S1.to - byKey.S1.from - 0.3) < 1e-9)
  assert.equal(byKey.S1.trades, 2)
  assert.equal(byKey.G1.option.value, 'gr')
  assert.equal(byKey.G1.trades, 2)
  // Prop B fell from 0.5 YES to 0.2: its NO side rose.
  assert.equal(byKey['P1:pb'].option.value, 'NO')
  // Untraded units are not movers.
  assert.equal(byKey['P1:pa'], undefined)
  assert.ok(moves[0].to - moves[0].from >= moves[1].to - moves[1].from)
  // A minimum move filters the rest out.
  assert.deepEqual(
    movesSince(units, store, 50, 0.26).map((m) => m.unit.key),
    ['P1:pb', 'S1']
  )
  // A window after every trade has no movers.
  assert.equal(movesSince(units, store, 400).length, 0)
})

test('leaderChange and resolvedSince', () => {
  const { store } = tradeStore()
  const g = leaderChange(unit('G1'), store, 50)
  assert.equal(g.option.value, 'gr')
  assert.equal(g.from, 0.4)
  assert.ok(Math.abs(g.to - 0.65) < 1e-9)
  assert.deepEqual(
    resolvedSince(units, 400).map((u) => u.key),
    ['P1:pc']
  )
  assert.equal(resolvedSince(units, 600).length, 0)
})
