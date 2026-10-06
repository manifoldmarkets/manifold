// Regression tests for the 2028/2032/2036 manifest generator. Run from the
// repository root:
//   TS_NODE_PROJECT=backend/scripts/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 \
//     node -r ts-node/register --test backend/scripts/elections-2028-2036/generate-manifests.test.ts
import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  idempotencyKeyFor,
  RaceManifestEntry,
  validateManifest,
} from 'shared/elections/election-market-creation'
import {
  CYCLES,
  cycleConfig,
  electionDay,
  EXPECTED_ELECTION_DATES,
  noonUtcAfter,
} from './cycles'
import { buildManifest, loadTopics, topicIdsFor } from './generate-manifests'
import { EXPECTED_COUNTS, inventories, racesFor } from './inventory'
import {
  assertSeedConstraints,
  leanOf,
  normalCdf,
  SEED_PARAMS,
  stageASeed,
} from './seeds'
import { ANSWERS } from './templates'

const NOW = Date.UTC(2026, 9, 6)
const GENERATED_AT = '2026-10-06T00:00:00.000Z'
const topics = loadTopics()
const built = Object.fromEntries(
  CYCLES.map((cycle) => [
    cycle,
    buildManifest(cycle, { topics, generatedAt: GENERATED_AT, now: NOW }),
  ])
) as Record<number, ReturnType<typeof buildManifest>>
const entriesOf = (cycle: number) =>
  built[cycle].manifest.entries as RaceManifestEntry[]
const allEntries = CYCLES.flatMap((c) => entriesOf(c))

test('election days are the Tuesday after the first Monday in November', () => {
  for (const cycle of CYCLES) {
    assert.equal(electionDay(cycle), EXPECTED_ELECTION_DATES[cycle])
    assert.equal(new Date(`${electionDay(cycle)}T00:00:00Z`).getUTCDay(), 2)
    const cfg = cycleConfig(cycle)
    assert.equal(cfg.closeTime, noonUtcAfter(cfg.electionDate))
    assert.equal(
      cfg.georgiaRunoffDate,
      new Date(Date.parse(cfg.electionDate) + 28 * 86_400_000)
        .toISOString()
        .slice(0, 10)
    )
    assert.equal(
      new Date(cfg.closeTime).toISOString().slice(11),
      '12:00:00.000Z'
    )
  }
  assert.equal(electionDay(2026), '2026-11-03')
  assert.equal(electionDay(2024), '2024-11-05')
})

test('counts per cycle and office match the brief; 739 markets at Ṁ1,000', () => {
  let total = 0
  let mana = 0
  for (const cycle of CYCLES) {
    const counts: Record<string, number> = {}
    for (const e of entriesOf(cycle))
      counts[e.identity.office] = (counts[e.identity.office] ?? 0) + 1
    for (const [office, n] of Object.entries(EXPECTED_COUNTS[cycle]))
      assert.equal(counts[office] ?? 0, n, `${cycle} ${office}`)
    total += entriesOf(cycle).length
    mana += built[cycle].totalMana
    assert.equal(
      built[cycle].manifest.budget.approvedMaxTotalMana,
      built[cycle].totalMana
    )
    assert.equal(built[cycle].totalMana, entriesOf(cycle).length * 1000)
  }
  assert.equal(entriesOf(2028).length, 537)
  assert.equal(entriesOf(2032).length, 101)
  assert.equal(entriesOf(2036).length, 101)
  assert.equal(total, 739)
  assert.equal(mana, 739_000)
})

test('every generated manifest validates with zero errors and is not approved', () => {
  for (const cycle of CYCLES) {
    const m = built[cycle].manifest
    assert.deepEqual(validateManifest(m, NOW), [])
    assert.equal(m.review.approved, false)
    assert.equal(m.series, `us-${cycle}-general-v1`)
    assert.equal(m.kind, 'races')
  }
})

test('race keys follow the 2026 style and reserved ids are unique across cycles', () => {
  const keys = new Set<string>()
  const ids = new Set<string>()
  for (const cycle of CYCLES)
    for (const e of entriesOf(cycle)) {
      const re = {
        senate: new RegExp(`^${cycle}-senate-[A-Z]{2}-regular-general$`),
        governor: new RegExp(`^${cycle}-governor-[A-Z]{2}-regular-general$`),
        house: new RegExp(`^${cycle}-house-[A-Z]{2}-\\d{2}-regular-general$`),
        president: new RegExp(
          `^${cycle}-president-([A-Z]{2}|[A-Z]{2}-0[1-3])-general$`
        ),
      }[e.identity.office]
      assert.match(e.raceKey, re)
      assert.ok(!keys.has(e.raceKey), `duplicate ${e.raceKey}`)
      keys.add(e.raceKey)
      const id = idempotencyKeyFor(built[cycle].manifest.series, e.raceKey)
      assert.ok(!ids.has(id), `duplicate reserved id for ${e.raceKey}`)
      ids.add(id)
    }
  assert.ok(keys.has('2028-house-AL-01-regular-general'))
  assert.ok(keys.has('2028-house-AK-00-regular-general'))
  assert.ok(keys.has('2028-senate-AZ-regular-general'))
  assert.ok(keys.has('2028-governor-NH-regular-general'))
  assert.ok(keys.has('2028-president-PA-general'))
  assert.ok(keys.has('2028-president-ME-02-general'))
  assert.ok(keys.has('2028-president-US-general'))
  assert.ok(keys.has('2032-senate-ME-regular-general'))
  assert.ok(keys.has('2036-senate-VT-regular-general'))
  assert.ok(
    !keys.has('2032-senate-VT-regular-general'),
    'Vermont has no Class 2 seat'
  )
  assert.ok(
    !keys.has('2028-senate-NE-regular-general'),
    'Nebraska has no Class 3 seat'
  )
})

test('answers are exactly the three generic party labels with valid seeds', () => {
  for (const e of allEntries) {
    assert.deepEqual(e.payload!.answers, [...ANSWERS])
    assert.deepEqual(
      e.answerMeta!.map((a) => a.party),
      ['D', 'R', 'other']
    )
    const probs = e.payload!.answerProbs!
    assert.doesNotThrow(() => assertSeedConstraints(probs))
    assert.ok(
      probs.every((p) => p >= 1 && p <= 98),
      `${e.raceKey}: ${probs}`
    )
    assert.equal(e.payload!.shouldAnswersSumToOne, true)
    assert.equal(e.payload!.addAnswersMode, 'DISABLED')
    assert.equal(e.payload!.liquidityTier, 1000)
    assert.equal(e.payload!.visibility, 'public')
    assert.equal(e.proposition, 'ballot-party')
    assert.deepEqual(e.identity.candidateNames, [])
  }
})

test('"Another party or independent" is 1% except the reviewed exceptions', () => {
  const exceptions = SEED_PARAMS.otherExceptions
  for (const e of allEntries) {
    const key = `${e.identity.cycle}-${e.identity.office}-${e.identity.state}`
    const other = e.payload!.answerProbs![2]
    if (exceptions[key]) assert.equal(other, exceptions[key].other, key)
    else assert.equal(other, 1, key)
  }
  // Every exception refers to a seat that is actually up in that cycle.
  for (const key of Object.keys(exceptions)) {
    const [cycle, office, state] = key.split('-')
    assert.ok(
      allEntries.some(
        (e) =>
          String(e.identity.cycle) === cycle &&
          e.identity.office === office &&
          e.identity.state === state
      ),
      `exception ${key} matches no race`
    )
    assert.ok(
      exceptions[key].why.length > 40,
      `exception ${key} needs a justification`
    )
  }
})

test('descriptions state the round, the party rule, the N/A cases and the elector rules', () => {
  for (const e of allEntries) {
    const d = e.payload!.descriptionMarkdown
    const cfg = cycleConfig(e.identity.cycle as 2028)
    assert.match(d, /\*\*Which round counts:\*\*/, e.raceKey)
    assert.match(d, /\*\*Party rule:\*\*/, e.raceKey)
    assert.match(d, /fusion/, e.raceKey)
    assert.match(d, /Another party or independent/, e.raceKey)
    assert.match(d, /N\/A/, e.raceKey)
    assert.match(d, /certified/, e.raceKey)
    assert.match(d, /seeds for the initial pool, not forecasts/, e.raceKey)
    assert.ok(d.length >= 400, e.raceKey)
    assert.ok(e.payload!.question.length <= 120, e.raceKey)
    const { office, state } = e.identity
    if (office === 'house') {
      assert.match(d, /renumbers/, e.raceKey)
      assert.match(d, /abolishes/, e.raceKey)
      assert.match(d, /map in effect for the 2028 election|at-large/, e.raceKey)
    }
    if (office === 'president') {
      assert.match(d, /faithless/i, e.raceKey)
      if (state === 'US') {
        assert.match(d, /Electoral College/, e.raceKey)
        assert.match(d, /contingent election/i, e.raceKey)
        assert.match(d, /Twelfth Amendment/, e.raceKey)
        assert.match(d, /270 of 538/, e.raceKey)
      } else {
        assert.match(d, /certificate of ascertainment/, e.raceKey)
        assert.match(d, /electoral vote/i, e.raceKey)
      }
      if (e.identity.district !== undefined)
        assert.match(
          d,
          /stops awarding an elector by congressional district/,
          e.raceKey
        )
      if (state === 'GA')
        assert.match(d, /does not apply to presidential electors/, e.raceKey)
    }
    if (state === 'GA' && (office === 'senate' || office === 'house')) {
      assert.match(d, /runoff/, e.raceKey)
      assert.match(d, /28th day/, e.raceKey)
      assert.match(d, new RegExp(cfg.georgiaRunoffDate.slice(0, 4)), e.raceKey)
    }
    if (state === 'ME' && office !== 'governor')
      assert.match(d, /ranked-choice/, e.raceKey)
    if (state === 'AK' && office !== 'governor')
      assert.match(d, /ranked-choice|repeal/, e.raceKey)
    if (state === 'LA' && (office === 'senate' || office === 'house'))
      assert.match(d, /closed party primaries/, e.raceKey)
    if (state === 'VT' && office === 'governor')
      assert.match(d, /General Assembly/, e.raceKey)
  }
})

test('close times are noon UTC the day after the general, later only for Georgia runoffs', () => {
  for (const cycle of CYCLES) {
    const cfg = cycleConfig(cycle)
    for (const e of entriesOf(cycle)) {
      const { office, state } = e.identity
      const expected =
        state === 'GA' && (office === 'senate' || office === 'house')
          ? cfg.georgiaCloseTime
          : cfg.closeTime
      assert.equal(e.payload!.closeTime, expected, e.raceKey)
      assert.ok(e.payload!.closeTime > NOW)
    }
  }
})

test('no candidate names anywhere traders see or the duplicate search uses', () => {
  const names = new Set<string>()
  for (const cls of Object.values(inventories.senate().classes))
    for (const s of cls.seats) names.add(s.incumbent)
  for (const g of inventories.governors().states) names.add(g.incumbent)
  for (const d of Object.values(inventories.results().districts))
    if (d.incumbent) names.add(d.incumbent)
  assert.ok(names.size > 400)
  for (const e of allEntries) {
    const visible = [
      e.payload!.question,
      ...e.payload!.answers!,
      ...e.searchTerms,
    ].join(' | ')
    for (const n of names) {
      const last = n.split(' ').pop()!
      if (last.length <= 3) continue
      assert.ok(
        !new RegExp(`\\b${n}\\b`).test(visible),
        `${e.raceKey} names ${n}`
      )
    }
    assert.ok(
      !/\bTrump\b|\bHarris\b|\bBiden\b|\bVance\b|\bNewsom\b/.test(visible),
      e.raceKey
    )
  }
})

test('topics: at most five existing prod ids per market; missing slugs are reported, never invented', () => {
  for (const e of allEntries) {
    const ids = e.payload!.groupIds ?? []
    assert.ok(ids.length >= 2 && ids.length <= 5, e.raceKey)
    for (const id of ids)
      assert.ok(
        Object.values(topics.existing).includes(id),
        `${e.raceKey}: unknown topic ${id}`
      )
    assert.equal(new Set(ids).size, ids.length)
  }
  assert.deepEqual(built[2028].missingTopics, [
    '2028-us-congressional-elections',
  ])
  assert.deepEqual(built[2032].missingTopics, [
    '2032-us-congressional-elections',
    '2032-us-elections',
  ])
  const { ids, missing } = topicIdsFor(topics, 'president', 2036)
  assert.deepEqual(missing, ['2036-us-elections'])
  assert.ok(ids.includes(topics.existing['2036-us-presidential-election']))
})

test('dashboard block is consistent: list, key, cycle and office', () => {
  for (const e of allEntries) {
    const { cycle, office, state } = e.identity
    assert.equal(e.dashboard.cycle, cycle)
    assert.equal(e.dashboard.office, office)
    assert.equal(
      e.dashboard.list,
      `${office === 'governor' ? 'governors' : office}${cycle}`
    )
    if (e.identity.district !== undefined)
      assert.equal(e.dashboard.key, `${state}-${e.identity.district}`)
    else assert.equal(e.dashboard.key, state)
  }
})

test('Stage A seed math: symmetric, monotone, and regressed by horizon', () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-9)
  assert.ok(Math.abs(normalCdf(1.959964) - 0.975) < 1e-5)
  assert.ok(Math.abs(normalCdf(-1) + normalCdf(1) - 1) < 1e-7)
  const national = { 2020: { d: 60, r: 40 }, 2024: { d: 48, r: 52 } }
  const even = { 2020: { d: 60, r: 40 }, 2024: { d: 48, r: 52 } }
  assert.ok(Math.abs(leanOf(even, national)) < 1e-9)
  const blue = { 2020: { d: 70, r: 30 }, 2024: { d: 58, r: 42 } }
  const lean = leanOf(blue, national)
  assert.ok(Math.abs(lean - 20) < 1e-9)
  const seeds = CYCLES.map((cycle) =>
    stageASeed({
      cycle,
      office: 'president',
      state: 'XX',
      unit: blue,
      national,
    })
  )
  assert.ok(seeds[0].pDem > seeds[1].pDem && seeds[1].pDem > seeds[2].pDem)
  assert.ok(seeds[2].pDem > 0.5)
  for (const s of seeds)
    assert.doesNotThrow(() => assertSeedConstraints(s.probs))
  const landslide = stageASeed({
    cycle: 2028,
    office: 'house',
    state: 'XX',
    unit: { 2024: { d: 20, r: 80 } },
    national,
  })
  assert.deepEqual(landslide.probs, [1, 98, 1])
  assert.deepEqual(landslide.yearsUsed, [2024])
  const nationalMarket = stageASeed({
    cycle: 2032,
    office: 'president',
    state: 'US',
    unit: {},
    national,
    nationalMarket: true,
  })
  assert.deepEqual(nationalMarket.probs, [49.5, 49.5, 1])
  const senate = stageASeed({
    cycle: 2028,
    office: 'senate',
    state: 'XX',
    unit: blue,
    national,
  })
  const governor = stageASeed({
    cycle: 2028,
    office: 'governor',
    state: 'XX',
    unit: blue,
    national,
  })
  assert.ok(seeds[0].pDem > senate.pDem && senate.pDem > governor.pDem)
})

test('rejections become reviewedRejectedContractIds and holds make entries unresolved without cost', () => {
  const r = buildManifest(2028, {
    topics,
    generatedAt: GENERATED_AT,
    now: NOW,
    rejections: { '2028-president-US-general': ['gUpCZZnNQz', '6AlnL5h85P'] },
    holds: [
      { pattern: '^2028-house-(GA|MD|MO|MS)-', reason: 'map likely to change' },
    ],
  })
  const entries = r.manifest.entries as RaceManifestEntry[]
  const us = entries.find((e) => e.raceKey === '2028-president-US-general')!
  assert.deepEqual(us.reviewedRejectedContractIds, ['gUpCZZnNQz', '6AlnL5h85P'])
  assert.deepEqual(
    entries.find((e) => e.raceKey === '2028-president-PA-general')!
      .reviewedRejectedContractIds,
    []
  )
  assert.equal(r.held.length, 14 + 8 + 8 + 4)
  const ga = entries.find(
    (e) => e.raceKey === '2028-house-GA-01-regular-general'
  )!
  assert.equal(ga.status, 'unresolved')
  assert.equal(ga.payload, undefined)
  assert.match(ga.unresolvedFields![0], /held: map likely to change/)
  assert.equal(entries.length, 537)
  assert.equal(r.totalMana, (537 - 34) * 1000)
  assert.equal(r.manifest.budget.approvedMaxTotalMana, r.totalMana)
  assert.deepEqual(validateManifest(r.manifest, NOW), [])
  assert.match(r.manifest.review.notes!, /34 entries held/)
})

test('generation is deterministic for a fixed generatedAt', () => {
  const again = buildManifest(2032, {
    topics,
    generatedAt: GENERATED_AT,
    now: NOW,
  })
  assert.equal(
    JSON.stringify(again.manifest),
    JSON.stringify(built[2032].manifest)
  )
})

test('the race inventory matches the manifests one to one', () => {
  for (const cycle of CYCLES) {
    const races = racesFor(cycle)
    assert.deepEqual(
      races.map((r) => r.raceKey),
      entriesOf(cycle).map((e) => e.raceKey)
    )
  }
})
