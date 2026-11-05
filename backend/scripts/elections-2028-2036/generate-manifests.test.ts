// Regression tests for the 2028, 2030, 2032, 2034 and 2036 manifest
// generator. Run from the repository root:
//   TS_NODE_PROJECT=backend/scripts/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 \
//     node -r ts-node/register --test backend/scripts/elections-2028-2036/generate-manifests.test.ts
import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  classifyExistingMarket,
  costOf,
  duplicateAction,
  hasOtherAnswer,
  idempotencyKeyFor,
  MarketLike,
  RaceManifestEntry,
  validateManifest,
} from 'shared/elections/election-market-creation'
import {
  CYCLES,
  cycleConfig,
  electionDay,
  EXPECTED_ELECTION_DATES,
  longDate,
  noonUtcAfter,
} from './cycles'
import {
  buildManifest,
  countsOf,
  loadRejections,
  loadTopics,
  topicIdsFor,
} from './generate-manifests'
import { EXPECTED_COUNTS, inventories, racesFor } from './inventory'
import {
  assertSeedConstraints,
  horizonMultiplier,
  leanOf,
  normalCdf,
  SEED_PARAMS,
  sigmaFor,
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
  assert.equal(electionDay(2030), '2030-11-05')
  assert.equal(
    new Date(cycleConfig(2030).closeTime).toISOString(),
    '2030-11-06T12:00:00.000Z'
  )
  assert.equal(cycleConfig(2030).georgiaRunoffDate, '2030-12-03')
  assert.equal(electionDay(2034), '2034-11-07')
  assert.equal(
    new Date(cycleConfig(2034).closeTime).toISOString(),
    '2034-11-08T12:00:00.000Z'
  )
  assert.equal(cycleConfig(2034).georgiaRunoffDate, '2034-12-05')
  assert.equal(
    new Date(cycleConfig(2034).georgiaCloseTime).toISOString(),
    '2034-12-06T12:00:00.000Z'
  )
})

test('counts per cycle and office match the brief: 1,031 markets, Ṁ2,489,000 for 2028–2036', () => {
  assert.deepEqual([...CYCLES], [2028, 2030, 2032, 2034, 2036])
  let total = 0
  let mana = 0
  for (const cycle of CYCLES) {
    const counts = countsOf(entriesOf(cycle))
    for (const [key, n] of Object.entries(EXPECTED_COUNTS[cycle]))
      assert.equal(counts[key] ?? 0, n, `${cycle} ${key}`)
    // Every generated entry is counted under one expected key.
    assert.deepEqual(
      Object.keys(counts).filter(
        (k) => !(k in EXPECTED_COUNTS[cycle]) || !counts[k]
      ),
      [],
      `${cycle}`
    )
    total += entriesOf(cycle).length
    mana += built[cycle].totalMana
    assert.equal(
      built[cycle].manifest.budget.approvedMaxTotalMana,
      built[cycle].totalMana
    )
    assert.equal(
      built[cycle].totalMana,
      entriesOf(cycle).reduce((sum, e) => sum + e.payload!.liquidityTier, 0)
    )
  }
  // Presidential cycles: 57 electoral markets plus 51 popular-vote markets.
  assert.equal(entriesOf(2028).length, 537 + 51)
  assert.equal(entriesOf(2030).length, 69)
  assert.equal(entriesOf(2032).length, 101 + 51)
  assert.equal(entriesOf(2034).length, 70)
  assert.equal(entriesOf(2036).length, 101 + 51)
  assert.equal(total, 1_031)
  // Popular vote: Ṁ10,000 each in 2028 (51 × 10,000), Ṁ1,000 in 2032/2036.
  assert.deepEqual(
    CYCLES.map((c) => built[c].totalMana),
    [1_518_000 + 510_000, 69_000, 110_000 + 51_000, 70_000, 110_000 + 51_000]
  )
  assert.equal(mana, 2_489_000)
})

test('every generated manifest validates with zero errors and is not approved', () => {
  for (const cycle of CYCLES) {
    const m = built[cycle].manifest
    assert.deepEqual(validateManifest(m, NOW), [])
    assert.equal(m.review.approved, false)
    assert.equal(m.series, `us-${cycle}-general-v1`)
    assert.equal(m.kind, 'races')
    // Every cycle through 2036 is planned; none is marked optional.
    assert.doesNotMatch(m.review.notes ?? '', /optional/i, `${cycle}`)
  }
})

test('2030 race keys are validated against the identity: a wrong cycle, office or state fails', () => {
  const ok = entriesOf(2030).find(
    (e) => e.raceKey === '2030-governor-GA-regular-general'
  )!
  const one = (entry: RaceManifestEntry) =>
    validateManifest({ ...built[2030].manifest, entries: [entry] }, NOW).join(
      ' '
    )
  assert.equal(one(ok), '')
  assert.match(
    one({ ...ok, raceKey: '2028-governor-GA-regular-general' }),
    /cycle 2028 must match identity.cycle 2030/
  )
  assert.match(
    one({ ...ok, raceKey: '2030-senate-GA-regular-general' }),
    /office senate must match identity.office governor/
  )
  assert.match(
    one({ ...ok, raceKey: '2030-governor-AL-regular-general' }),
    /state AL must match identity.state GA/
  )
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
        president:
          e.proposition === 'popular-vote-party'
            ? new RegExp(`^${cycle}-president-[A-Z]{2}-popular-vote$`)
            : new RegExp(
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
  assert.ok(keys.has('2028-president-AL-popular-vote'))
  assert.ok(keys.has('2036-president-DC-popular-vote'))
  assert.ok(!keys.has('2028-president-US-popular-vote'))
  assert.ok(!keys.has('2028-president-NE-02-popular-vote'))
  assert.ok(keys.has('2032-senate-ME-regular-general'))
  assert.ok(keys.has('2036-senate-VT-regular-general'))
  assert.ok(keys.has('2030-senate-ME-regular-general'))
  assert.ok(keys.has('2030-senate-VT-regular-general'))
  assert.ok(keys.has('2030-governor-GA-regular-general'))
  assert.ok(keys.has('2030-governor-NH-regular-general'))
  assert.ok(keys.has('2030-governor-VT-regular-general'))
  assert.ok(
    !keys.has('2032-senate-VT-regular-general'),
    'Vermont has no Class 2 seat'
  )
  assert.ok(
    !keys.has('2028-senate-NE-regular-general'),
    'Nebraska has no Class 3 seat'
  )
  assert.ok(
    !keys.has('2030-senate-GA-regular-general'),
    'Georgia has no Class 1 seat'
  )
  assert.ok(
    ![...keys].some((k) => /^2030-(president|house)-/.test(k)),
    '2030 has no presidential or House entries'
  )
})

test('2030 midterm: the 33 Class 1 seats and the 36 governorships of the 2026 cycle', () => {
  const statesOf = (cycle: number, office: string) =>
    entriesOf(cycle)
      .filter((e) => e.identity.office === office)
      .map((e) => e.identity.state)
      .sort()
  const senate2030 = statesOf(2030, 'senate')
  // The Class 1 states, as verified on 2026-11-05 (senate-classes.json
  // sources): spelled out so a wrong seat in the inventory fails here.
  assert.deepEqual(senate2030, [
    'AZ',
    'CA',
    'CT',
    'DE',
    'FL',
    'HI',
    'IN',
    'MA',
    'MD',
    'ME',
    'MI',
    'MN',
    'MO',
    'MS',
    'MT',
    'ND',
    'NE',
    'NJ',
    'NM',
    'NV',
    'NY',
    'OH',
    'PA',
    'RI',
    'TN',
    'TX',
    'UT',
    'VA',
    'VT',
    'WA',
    'WI',
    'WV',
    'WY',
  ])
  assert.deepEqual(senate2030, statesOf(2036, 'senate'), 'same Class 1 seats')
  assert.equal(
    new Set([
      ...senate2030,
      ...statesOf(2028, 'senate'),
      ...statesOf(2032, 'senate'),
    ]).size,
    50,
    'the three classes cover every state'
  )
  assert.deepEqual(statesOf(2030, 'governor'), [
    'AK',
    'AL',
    'AR',
    'AZ',
    'CA',
    'CO',
    'CT',
    'FL',
    'GA',
    'HI',
    'IA',
    'ID',
    'IL',
    'KS',
    'MA',
    'MD',
    'ME',
    'MI',
    'MN',
    'NE',
    'NH',
    'NM',
    'NV',
    'NY',
    'OH',
    'OK',
    'OR',
    'PA',
    'RI',
    'SC',
    'SD',
    'TN',
    'TX',
    'VT',
    'WI',
    'WY',
  ])
  // New Hampshire and Vermont (two-year terms) are the only governorships
  // up in both 2028 and 2030.
  assert.deepEqual(
    statesOf(2030, 'governor').filter((s) =>
      statesOf(2028, 'governor').includes(s)
    ),
    ['NH', 'VT']
  )
  for (const e of entriesOf(2030)) {
    const { office, state } = e.identity
    const seat = String(e.evidence?.seat)
    if (office === 'senate')
      assert.equal(seat, 'Class 1 seat; term beginning January 3, 2031')
    else
      assert.equal(
        seat,
        `${state === 'NH' || state === 'VT' ? 2 : 4}-year term beginning ${
          state === 'AK' || state === 'HI' ? 'December 2030' : 'January 2031'
        }`,
        e.raceKey
      )
    assert.equal(
      e.dashboard.list,
      `${office === 'governor' ? 'governors' : office}2030`
    )
    assert.ok(!e.reviewedRejectedContractIds?.length)
  }
  // σ for 2030 is the 2028 σ × 7/6.
  const ga = entriesOf(2030).find(
    (e) => e.raceKey === '2030-governor-GA-regular-general'
  )!
  const source = (ga.seed as { source?: { sigma: number } }).source!
  assert.equal(source.sigma, Number(((20 * 7) / 6).toFixed(3)))
})

test('2034 midterm: the 34 Class 3 seats of 2028 and the 36 governorships of 2030', () => {
  const statesOf = (cycle: number, office: string) =>
    entriesOf(cycle)
      .filter((e) => e.identity.office === office)
      .map((e) => e.identity.state)
      .sort()
  assert.equal(statesOf(2034, 'senate').length, 34)
  assert.deepEqual(statesOf(2034, 'senate'), statesOf(2028, 'senate'))
  assert.deepEqual(statesOf(2034, 'governor'), statesOf(2030, 'governor'))
  assert.equal(statesOf(2034, 'president').length, 0)
  assert.equal(statesOf(2034, 'house').length, 0)
  const cfg = cycleConfig(2034)
  assert.equal(cfg.series, 'us-2034-general-v1')
  for (const e of entriesOf(2034)) {
    const { office, state } = e.identity
    assert.match(e.raceKey, /^2034-(senate|governor)-[A-Z]{2}-regular-general$/)
    assert.equal(
      e.dashboard.list,
      `${office === 'governor' ? 'governors' : office}2034`
    )
    if (office === 'senate')
      assert.equal(
        String(e.evidence?.seat),
        'Class 3 seat; term beginning January 3, 2035'
      )
    // Georgia's runoff (December 5, 2034) keeps Senate and governor open.
    assert.equal(
      e.payload!.closeTime,
      state === 'GA' ? cfg.georgiaCloseTime : cfg.closeTime,
      e.raceKey
    )
    assert.ok(
      e.payload!.descriptionMarkdown.includes('November 7, 2034'),
      e.raceKey
    )
  }
  const desc = (k: string) =>
    entriesOf(2034).find((e) => e.raceKey === k)!.payload!.descriptionMarkdown
  assert.ok(
    desc('2034-senate-GA-regular-general').includes(
      'If no candidate gets a majority, the December 5, 2034 runoff decides.'
    )
  )
  assert.ok(
    desc('2034-governor-VT-regular-general').includes(
      'the Vermont legislature picks the governor in January 2035'
    )
  )
  // σ for 2034 is the 2028 σ × 1.5 (horizon 1 + 6/12).
  assert.equal(horizonMultiplier(2034), 1.5)
  const pa = entriesOf(2034).find(
    (e) => e.raceKey === '2034-senate-PA-regular-general'
  )!
  assert.equal(
    (pa.seed as { source?: { sigma: number } }).source!.sigma,
    14 * 1.5
  )
  // The 2028 Class 3 "Other" exceptions carry over to the same seats.
  const other = (k: string) => {
    const [d, r] = entriesOf(2034).find((e) => e.raceKey === k)!.payload!
      .answerProbs!
    return Math.round((100 - d - r) * 10) / 10
  }
  assert.equal(other('2034-senate-AK-regular-general'), 8)
  assert.equal(other('2034-senate-UT-regular-general'), 6)
})

// The server's "Other" opens at 100 minus the two listed seeds.
const otherOf = (e: RaceManifestEntry) =>
  Math.round(
    (100 - e.payload!.answerProbs![0] - e.payload!.answerProbs![1]) * 10
  ) / 10

test('answers are the two party labels plus the server\'s "Other", with valid seeds', () => {
  for (const e of allEntries) {
    assert.deepEqual(e.payload!.answers, [...ANSWERS])
    assert.deepEqual([...ANSWERS], ['Democratic Party', 'Republican Party'])
    assert.deepEqual(
      e.answerMeta!.map((a) => [a.label, a.party, !!a.isOther]),
      [
        ['Democratic Party', 'D', false],
        ['Republican Party', 'R', false],
        ['Other', 'other', true],
      ]
    )
    const probs = e.payload!.answerProbs!
    assert.equal(probs.length, 2, e.raceKey)
    const all = [...probs, otherOf(e)]
    assert.doesNotThrow(() => assertSeedConstraints(all))
    assert.ok(
      all.every((p) => p >= 1 && p <= 98),
      `${e.raceKey}: ${all}`
    )
    assert.equal(e.payload!.shouldAnswersSumToOne, true)
    assert.equal(e.payload!.addAnswersMode, 'ONLY_CREATOR')
    // Two listed answers plus Other: the ante is the tier itself (three
    // answers never exceed the tier's minimum).
    assert.equal(hasOtherAnswer(e.payload!), true)
    assert.ok([1_000, 10_000, 100_000].includes(e.payload!.liquidityTier))
    assert.deepEqual(
      [costOf(e.payload!).numAnswers, costOf(e.payload!).total],
      [3, e.payload!.liquidityTier]
    )
    assert.equal(e.payload!.visibility, 'public')
    assert.equal(
      e.proposition,
      e.raceKey.endsWith('-popular-vote')
        ? 'popular-vote-party'
        : 'ballot-party'
    )
    assert.deepEqual(e.identity.candidateNames, [])
  }
})

test('"Other" opens at 1% except the reviewed exceptions', () => {
  const exceptions = SEED_PARAMS.otherExceptions
  for (const e of allEntries) {
    const key = `${e.identity.cycle}-${e.identity.office}-${e.identity.state}`
    const other = otherOf(e)
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

// The one-sentence deciding-round rule a description carries, if any.
const expectedRound = (e: RaceManifestEntry): RegExp | undefined => {
  const { office, state, cycle } = e.identity
  const cfg = cycleConfig(cycle as 2028)
  // A popular-vote market in a ranked-choice state counts the final round.
  if (e.proposition === 'popular-vote-party')
    return state === 'ME' || state === 'AK'
      ? new RegExp(
          `If ${
            state === 'ME' ? 'Maine' : 'Alaska'
          } counts presidential votes by ranked choice in ${cycle}, the final round's totals count\\.$`
        )
      : undefined
  // Electoral presidential markets follow the certified electors: no round
  // sentence.
  if (office === 'president') return undefined
  if (state === 'GA')
    return new RegExp(
      `If no candidate gets a majority, the ${longDate(
        cfg.georgiaRunoffDate
      )} runoff decides\\.`
    )
  if (state === 'AK')
    return new RegExp(
      `The final count under whatever counting method Alaska uses in ${cycle} decides\\.`
    )
  if (office === 'governor')
    return state === 'VT'
      ? new RegExp(
          `If no candidate gets a majority, the Vermont legislature picks the governor in January ${
            cycle + 1
          }, and that pick decides\\.`
        )
      : state === 'WA' || state === 'CA'
      ? /general election is between the top two primary finishers, whatever their parties\./
      : state === 'ME'
      ? /Decided by plurality, unless Maine extends ranked-choice counting to governor races/
      : undefined
  return state === 'ME'
    ? /If no candidate gets a first-round majority, the final ranked-choice round decides\./
    : state === 'LA'
    ? /If Louisiana adds a later deciding round \(such as a runoff\) for this election, that round decides\./
    : undefined
}

test('descriptions are short plain paragraphs: the election and date, the party rule, how it resolves and when it is N/A', () => {
  const lengths: number[] = []
  for (const e of allEntries) {
    const d = e.payload!.descriptionMarkdown
    const { office, state, cycle, stateName } = e.identity
    const cfg = cycleConfig(cycle as 2028)
    const paras = d.split('\n\n')
    lengths.push(d.length)
    // Plain text only: no labels, seeds, answer-curation or hub paragraphs.
    assert.doesNotMatch(
      d,
      /\*\*|@ManifoldPolitics|Opening odds|manifold\.markets|SEEDS\.md|Stage A|Another party|fusion|Which round counts/,
      e.raceKey
    )
    // The longest are the presidential state markets (allocation, successor
    // system and split-elector sentences): about 850 characters, 912 for DC.
    assert.ok(d.length >= 350 && d.length <= 950, `${e.raceKey}: ${d.length}`)
    assert.equal(paras.length, 3, e.raceKey)
    // What it resolves to, on which date.
    assert.match(paras[0], /^Resolves to the party /, e.raceKey)
    assert.ok(d.includes(longDate(cfg.electionDate)), e.raceKey)
    // Only the party matters, and anyone else is Other (or their own answer).
    assert.match(
      d,
      office === 'president'
        ? /Only the party matters: a ticket on the Democratic or Republican line counts as that party even if also listed on other parties' lines\. Any other ticket resolves to Other, or to its own answer if one has been added\./
        : /Only the party matters: a Democratic or Republican nominee counts as that party even if also listed on other parties' lines\. Anyone else resolves to Other, or to their own answer if one has been added\./,
      e.raceKey
    )
    // When it is N/A, and (except nationally) how it resolves.
    assert.match(d, /N\/A (if|only if) /, e.raceKey)
    if (office !== 'president')
      assert.match(
        paras[paras.length - 1],
        /^Resolves on the certified result, or earlier once the AP has called the race and no recount could change it\. N\/A if /,
        e.raceKey
      )
    if (office === 'senate')
      assert.ok(
        paras[0].startsWith(
          `Resolves to the party that wins the ${longDate(
            cfg.electionDate
          )} U.S. Senate election in ${stateName} (Class ${
            { 2028: 3, 2030: 1, 2032: 2, 2034: 3, 2036: 1 }[cycle]
          } seat).`
        ),
        e.raceKey
      )
    if (office === 'governor')
      assert.ok(
        paras[0].startsWith(
          `Resolves to the party that wins the ${longDate(
            cfg.electionDate
          )} election for Governor of ${stateName}.`
        ),
        e.raceKey
      )
    if (office === 'house') {
      // Follow whatever district carries the number; N/A if none does.
      const n = e.identity.district!
      assert.doesNotMatch(d, /renumber|abolish|number of seats/, e.raceKey)
      assert.ok(
        paras[0].includes(
          n === 0
            ? `U.S. House election in ${stateName}'s at-large seat. N/A if ${stateName} has no at-large seat in 2028.`
            : `whichever district is numbered ${n} on the map in effect for that election. N/A if that map has no district numbered ${n}.`
        ),
        e.raceKey
      )
    }
    if (e.proposition === 'popular-vote-party') {
      // A state's popular vote: the most votes there, whatever happens to its
      // electoral votes; the certified result decides.
      const name = state === 'DC' ? 'the District of Columbia' : stateName
      const possessive =
        state === 'DC' ? "the District of Columbia's" : `${stateName}'s`
      assert.ok(
        paras[0].startsWith(
          `Resolves to the party of the presidential ticket with the most votes in ${name} in the ${longDate(
            cfg.electionDate
          )} election, per ${possessive} certified result. Only the vote count matters: how ${name} awards its electoral votes, including under a national popular vote compact, doesn't.`
        ),
        e.raceKey
      )
      assert.equal(
        paras[2],
        `Resolves on the certified result, or earlier once the AP has called it and no recount could change it. N/A if ${name} holds no popular vote for President.`,
        e.raceKey
      )
      assert.doesNotMatch(d, /\belectors?\b|faithless/i, e.raceKey)
    } else if (office === 'president') {
      if (state === 'US') {
        // The national market doesn't depend on the Electoral College,
        // electors or Congress's count: whoever is elected, however decided.
        assert.doesNotMatch(
          d,
          /electoral|elector|\b270\b|\bCongress\b|contingent/i,
          e.raceKey
        )
        assert.equal(
          paras[0],
          `Resolves to the party of the person elected President in the ${longDate(
            cfg.electionDate
          )} election, however the winner is officially decided.`,
          e.raceKey
        )
        assert.ok(
          d.endsWith(
            `N/A if no presidential election is held for the term starting January 20, ${
              cycle + 1
            }.`
          ),
          e.raceKey
        )
      } else if (e.identity.district !== undefined) {
        // A district market follows the district's electoral vote.
        const n = e.identity.district
        assert.equal(
          paras[0],
          `Resolves to the party of the presidential ticket that gets the electoral vote of ${stateName}'s ${
            n === 1 ? '1st' : n === 2 ? '2nd' : '3rd'
          } congressional district (${state}-${n}) in the ${longDate(
            cfg.electionDate
          )} election. N/A if ${stateName} no longer awards an electoral vote by district.`,
          e.raceKey
        )
        assert.equal(
          paras[2],
          `Resolves on the electors ${stateName} certifies, or earlier once the AP has called the district and nothing could change it. Faithless electors don't change it.`,
          e.raceKey
        )
      } else {
        // A state market follows where the state's electoral votes go,
        // however it awards them (an interstate compact included), and its
        // say in any system that replaces them.
        const name = state === 'DC' ? 'the District of Columbia' : stateName
        const possessive =
          state === 'DC' ? "the District of Columbia's" : `${stateName}'s`
        const votes =
          state === 'ME' || state === 'NE'
            ? `${possessive} two statewide electoral votes`
            : `${possessive} electoral votes`
        assert.equal(
          paras[0],
          `Resolves to the party of the presidential ticket that gets ${votes} in the ${longDate(
            cfg.electionDate
          )} election, however ${name} awards them: by its own vote, by the national popular vote under an interstate compact, or any other way. If electoral votes are replaced by another system, it follows whatever say ${name} has in that system; N/A if it has none.`,
          e.raceKey
        )
        // Split electors resolve proportionally; for Maine and Nebraska that
        // means the two statewide electors, never the district ones.
        assert.equal(
          paras[2],
          `Resolves on the electors ${name} certifies, or earlier once the AP has called the ${
            state === 'DC' ? 'District' : 'state'
          } and nothing could change it. ${
            state === 'ME' || state === 'NE'
              ? 'If the two statewide electors are split between tickets'
              : 'If those electors are split between tickets'
          }, it resolves to each party in proportion to its share of them. Faithless electors don't change it.`,
          e.raceKey
        )
      }
      // Districts have one elector: no split sentence.
      if (e.identity.district !== undefined)
        assert.doesNotMatch(d, /split|proportion/, e.raceKey)
      // Certified electors decide: no counting-rule sentence.
      assert.doesNotMatch(d, /ranked-choice|counting method/, e.raceKey)
    }
    // A state's deciding-round rule is one short sentence in the first
    // paragraph; every other race has none.
    const round = expectedRound(e)
    if (round) assert.match(paras[0], round, e.raceKey)
    else
      assert.doesNotMatch(
        paras[0],
        /runoff|ranked-choice|top two|legislature|counting method|deciding round|plurality/,
        e.raceKey
      )
    if (state === 'AK') assert.doesNotMatch(d, /repeal/, e.raceKey)
    // Minnesota's and North Dakota's Democratic parties use other ballot
    // names; the party rule says they count as Democratic.
    assert.equal(
      d.includes('The DFL line counts as Democratic.'),
      state === 'MN',
      e.raceKey
    )
    assert.equal(
      d.includes('The Democratic-NPL line counts as Democratic.'),
      state === 'ND',
      e.raceKey
    )
  }
  // Short: about a fifth of the earlier ~2,500 characters.
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length
  assert.ok(mean < 650, `mean description length ${mean}`)
})

test('no description mentions anyone: an @mention notifies that user even on an unlisted market', () => {
  // createNewContractNotification sends tagged_user notifications to every
  // user mentioned in the description, whatever the market's visibility.
  for (const e of allEntries)
    assert.doesNotMatch(e.payload!.descriptionMarkdown, /@\w/, e.raceKey)
})

test('the exact text for one market of each kind', () => {
  const desc = (key: string) =>
    allEntries.find((e) => e.raceKey === key)!.payload!.descriptionMarkdown
  assert.equal(
    desc('2028-senate-GA-regular-general'),
    [
      'Resolves to the party that wins the November 7, 2028 U.S. Senate election in Georgia (Class 3 seat). If no candidate gets a majority, the December 5, 2028 runoff decides.',
      "Only the party matters: a Democratic or Republican nominee counts as that party even if also listed on other parties' lines. Anyone else resolves to Other, or to their own answer if one has been added.",
      'Resolves on the certified result, or earlier once the AP has called the race and no recount could change it. N/A if no election for this seat is held.',
    ].join('\n\n')
  )
  assert.equal(
    desc('2028-house-AL-01-regular-general').split('\n\n')[0],
    "Resolves to the party that wins the November 7, 2028 U.S. House election in Alabama's 1st District: whichever district is numbered 1 on the map in effect for that election. N/A if that map has no district numbered 1."
  )
  const TICKET =
    "Only the party matters: a ticket on the Democratic or Republican line counts as that party even if also listed on other parties' lines. Any other ticket resolves to Other, or to its own answer if one has been added."
  assert.equal(
    desc('2028-president-NE-02-general'),
    [
      "Resolves to the party of the presidential ticket that gets the electoral vote of Nebraska's 2nd congressional district (NE-2) in the November 7, 2028 election. N/A if Nebraska no longer awards an electoral vote by district.",
      TICKET,
      "Resolves on the electors Nebraska certifies, or earlier once the AP has called the district and nothing could change it. Faithless electors don't change it.",
    ].join('\n\n')
  )
  assert.equal(
    desc('2028-president-AL-general'),
    [
      "Resolves to the party of the presidential ticket that gets Alabama's electoral votes in the November 7, 2028 election, however Alabama awards them: by its own vote, by the national popular vote under an interstate compact, or any other way. If electoral votes are replaced by another system, it follows whatever say Alabama has in that system; N/A if it has none.",
      TICKET,
      "Resolves on the electors Alabama certifies, or earlier once the AP has called the state and nothing could change it. If those electors are split between tickets, it resolves to each party in proportion to its share of them. Faithless electors don't change it.",
    ].join('\n\n')
  )
  assert.equal(
    desc('2028-president-ME-general').split('\n\n')[0],
    "Resolves to the party of the presidential ticket that gets Maine's two statewide electoral votes in the November 7, 2028 election, however Maine awards them: by its own vote, by the national popular vote under an interstate compact, or any other way. If electoral votes are replaced by another system, it follows whatever say Maine has in that system; N/A if it has none."
  )
  assert.equal(
    desc('2028-president-ME-general').split('\n\n')[2],
    "Resolves on the electors Maine certifies, or earlier once the AP has called the state and nothing could change it. If the two statewide electors are split between tickets, it resolves to each party in proportion to its share of them. Faithless electors don't change it."
  )
  assert.equal(
    desc('2028-president-NE-general').split('\n\n')[2],
    "Resolves on the electors Nebraska certifies, or earlier once the AP has called the state and nothing could change it. If the two statewide electors are split between tickets, it resolves to each party in proportion to its share of them. Faithless electors don't change it."
  )
  assert.equal(
    desc('2028-president-DC-general').split('\n\n')[2],
    "Resolves on the electors the District of Columbia certifies, or earlier once the AP has called the District and nothing could change it. If those electors are split between tickets, it resolves to each party in proportion to its share of them. Faithless electors don't change it."
  )
  assert.equal(
    desc('2028-president-US-general'),
    [
      'Resolves to the party of the person elected President in the November 7, 2028 election, however the winner is officially decided.',
      TICKET,
      'N/A if no presidential election is held for the term starting January 20, 2029.',
    ].join('\n\n')
  )
  assert.equal(
    desc('2028-president-AL-popular-vote'),
    [
      "Resolves to the party of the presidential ticket with the most votes in Alabama in the November 7, 2028 election, per Alabama's certified result. Only the vote count matters: how Alabama awards its electoral votes, including under a national popular vote compact, doesn't.",
      TICKET,
      'Resolves on the certified result, or earlier once the AP has called it and no recount could change it. N/A if Alabama holds no popular vote for President.',
    ].join('\n\n')
  )
  assert.equal(
    desc('2028-president-ME-popular-vote').split('\n\n')[0],
    "Resolves to the party of the presidential ticket with the most votes in Maine in the November 7, 2028 election, per Maine's certified result. Only the vote count matters: how Maine awards its electoral votes, including under a national popular vote compact, doesn't. If Maine counts presidential votes by ranked choice in 2028, the final round's totals count."
  )
  assert.equal(
    allEntries.find((e) => e.raceKey === '2032-president-DC-popular-vote')!
      .payload!.question,
    'Which party will win the popular vote in the District of Columbia in the 2032 presidential election?'
  )
  assert.equal(
    desc('2030-governor-VT-regular-general').split('\n\n')[0],
    'Resolves to the party that wins the November 5, 2030 election for Governor of Vermont. If no candidate gets a majority, the Vermont legislature picks the governor in January 2031, and that pick decides.'
  )
})

test('seeds are documented for reviewers in seed.basis, not in the market text', () => {
  const basis = (key: string) =>
    allEntries.find((e) => e.raceKey === key)!.seed!.basis
  assert.equal(
    basis('2028-senate-AL-regular-general'),
    'Opening odds are a starting point, not a forecast. Alabama voted 29.9 points more Republican than the country in the 2020 and 2024 presidential elections; pulled toward even for a race this far off, that gives Democrats 1.6% and Republicans 97.4%. Other opens at 1%.'
  )
  assert.equal(
    basis('2028-president-US-general'),
    'Opening odds are a starting point, not a forecast. The national market opens with the parties even: Democrats 49.5%, Republicans 49.5%. Other opens at 1%.'
  )
  assert.match(
    basis('2030-senate-ME-regular-general'),
    /Other opens at 10% rather than 1%: the Class 1 seat is Angus King’s .*plausible\.$/
  )
  for (const e of allEntries) {
    const b = e.seed!.basis
    const [d, r] = e.payload!.answerProbs!
    assert.ok(
      b.includes(
        e.identity.state === 'US'
          ? `Democrats ${d}%, Republicans ${r}%`
          : `that gives Democrats ${d}% and Republicans ${r}%.`
      ),
      e.raceKey
    )
    assert.ok(b.includes(`Other opens at ${otherOf(e)}%`), e.raceKey)
    assert.ok(!e.payload!.descriptionMarkdown.includes(b), e.raceKey)
  }
})

test('liquidity tiers: Ṁ100k for the 2028 presidential market, Ṁ10k for the other 2028 presidential, winner and competitive 2028 markets', () => {
  const code = (e: RaceManifestEntry) =>
    e.identity.district !== undefined
      ? `${e.identity.state}-${String(e.identity.district).padStart(2, '0')}`
      : e.identity.state
  const at = (cycle: number, office: string, tier: number) =>
    entriesOf(cycle)
      .filter(
        (e) => e.identity.office === office && e.payload!.liquidityTier === tier
      )
      .map(code)
  assert.deepEqual(at(2028, 'president', 100_000), ['US'])
  // 2028: the 56 electoral state/district markets and the 51 popular-vote
  // markets (every 2028 presidential market at Ṁ10k).
  assert.equal(at(2028, 'president', 10_000).length, 56 + 51)
  assert.equal(
    entriesOf(2028).filter(
      (e) =>
        e.proposition === 'popular-vote-party' &&
        e.payload!.liquidityTier === 10_000 &&
        /popular-vote market for a state \(Tod, 5 Nov 2026/.test(
          e.liquidityPlan!.rationale
        )
    ).length,
    51
  )
  // 2032/2036: only the national market is raised; popular vote stays 1,000.
  assert.deepEqual(at(2032, 'president', 10_000), ['US'])
  assert.deepEqual(at(2036, 'president', 10_000), ['US'])
  assert.deepEqual(at(2028, 'senate', 10_000).sort(), [
    'AZ',
    'GA',
    'NC',
    'NH',
    'NV',
    'PA',
    'WI',
  ])
  assert.deepEqual(at(2028, 'governor', 10_000).sort(), ['NC', 'NH'])
  assert.deepEqual(at(2028, 'house', 10_000).sort(), [
    'AZ-01',
    'AZ-06',
    'CA-13',
    'CA-22',
    'CA-48',
    'CO-08',
    'IA-03',
    'IL-17',
    'IN-01',
    'KS-03',
    'MI-07',
    'MI-08',
    'NE-02',
    'NH-01',
    'NH-02',
    'NJ-07',
    'NM-02',
    'NV-01',
    'NV-03',
    'NV-04',
    'NY-03',
    'NY-17',
    'NY-18',
    'NY-19',
    'OH-01',
    'OH-13',
    'PA-01',
    'PA-07',
    'PA-17',
    'VA-02',
    'VA-07',
    'WA-08',
    'WI-01',
  ])
  for (const e of allEntries) {
    const tier = e.payload!.liquidityTier
    const lean = Math.abs(
      Math.round((e.seed as { source?: { lean: number } }).source!.lean * 10) /
        10
    )
    // Competitive 2028 races are within 8 points (Senate, governor) or 5
    // points (House) of the national environment; later cycles stay 1,000.
    if (e.identity.cycle === 2028 && e.identity.office !== 'president')
      assert.equal(
        tier === 10_000,
        lean <= (e.identity.office === 'house' ? 5 : 8),
        e.raceKey
      )
    if (e.identity.cycle !== 2028 && e.identity.state !== 'US')
      assert.equal(tier, 1_000, e.raceKey)
    // Every raised market says why in its liquidity plan.
    assert.equal(e.liquidityPlan!.tier, tier, e.raceKey)
    if (tier > 1_000)
      assert.match(
        e.liquidityPlan!.rationale,
        /Tod, 5 Nov 2026|Competitive: within/,
        e.raceKey
      )
  }
  for (const cycle of CYCLES)
    assert.match(
      built[cycle].manifest.review.notes!,
      new RegExp(`Planned spend for this cycle: ${built[cycle].totalMana} mana`)
    )
})

test('every manifest creates official markets even where a community market exists', () => {
  // Only an EQUIVALENT @ManifoldPolitics market skips an entry; the policy
  // lives in the manifest, so the apply run can't forget it.
  for (const cycle of CYCLES) {
    assert.deepEqual(built[cycle].manifest.duplicatePolicy, {
      blockingCreators: ['ManifoldPolitics'],
    })
    assert.deepEqual(validateManifest(built[cycle].manifest, NOW), [])
  }
  assert.deepEqual(loadRejections(), {})
})

test('close times are noon UTC the day after the general, later only for Georgia runoffs', () => {
  for (const cycle of CYCLES) {
    const cfg = cycleConfig(cycle)
    for (const e of entriesOf(cycle)) {
      const { office, state } = e.identity
      // Georgia's majority rule covers Senate, House and governor, not
      // presidential electors.
      const expected =
        state === 'GA' && office !== 'president'
          ? cfg.georgiaCloseTime
          : cfg.closeTime
      assert.equal(e.payload!.closeTime, expected, e.raceKey)
      assert.ok(e.payload!.closeTime > NOW)
    }
  }
  const close2030 = (key: string) =>
    new Date(
      entriesOf(2030).find((e) => e.raceKey === key)!.payload!.closeTime
    ).toISOString()
  assert.equal(
    close2030('2030-senate-PA-regular-general'),
    '2030-11-06T12:00:00.000Z'
  )
  assert.equal(
    close2030('2030-governor-GA-regular-general'),
    '2030-12-04T12:00:00.000Z'
  )
  assert.equal(
    close2030('2030-governor-AK-regular-general'),
    '2030-11-06T12:00:00.000Z'
  )
  assert.equal(
    entriesOf(2030).filter(
      (e) => e.payload!.closeTime !== cycleConfig(2030).closeTime
    ).length,
    1,
    'only Georgia governor closes after the runoff in 2030'
  )
})

test('no candidate names anywhere traders see or the duplicate search uses', () => {
  const names = new Set<string>()
  for (const cls of Object.values(inventories.senate().classes))
    for (const s of cls.seats) names.add(s.incumbent)
  for (const cycle of CYCLES)
    for (const g of inventories.governors(cycle).states) names.add(g.incumbent)
  // The midterm-year governors are in the list too.
  assert.ok(names.has('Brian Kemp') && names.has('Kay Ivey'))
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
  assert.deepEqual(built[2030].missingTopics, [
    '2030-us-congressional-elections',
    '2030-us-elections',
  ])
  // Every missing slug is listed for Tod in topics.json → missing.
  for (const cycle of CYCLES)
    for (const slug of built[cycle].missingTopics)
      assert.ok(
        topics.missing.some((m) => m.slug === slug),
        `${slug} is not in topics.json missing`
      )
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
      `${
        e.proposition === 'popular-vote-party'
          ? 'presidentPopular'
          : office === 'governor'
          ? 'governors'
          : office
      }${cycle}`
    )
    if (e.identity.district !== undefined)
      assert.equal(e.dashboard.key, `${state}-${e.identity.district}`)
    else assert.equal(e.dashboard.key, state)
  }
})

test('horizon multiplier is 1 + (cycle − 2028)/12 and leaves the 2028/2032/2036 σ unchanged', () => {
  assert.equal(horizonMultiplier(2028), 1)
  assert.equal(horizonMultiplier(2030), 7 / 6)
  assert.equal(horizonMultiplier(2032), 4 / 3)
  assert.equal(horizonMultiplier(2034), 3 / 2)
  assert.equal(horizonMultiplier(2036), 5 / 3)
  // Exactly the values of the earlier fixed table, so no 2032/2036 seed moves.
  for (const office of ['president', 'house', 'senate', 'governor'] as const) {
    assert.equal(
      sigmaFor(office, 2032),
      SEED_PARAMS.sigma2028[office] * (4 / 3)
    )
    assert.equal(
      sigmaFor(office, 2036),
      SEED_PARAMS.sigma2028[office] * (5 / 3)
    )
  }
  assert.ok(Math.abs(sigmaFor('senate', 2030) - 14 * (7 / 6)) < 1e-12)
  assert.ok(Math.abs(sigmaFor('governor', 2030) - 20 * (7 / 6)) < 1e-12)
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
  // CYCLES is in date order: each later cycle regresses further.
  for (let i = 1; i < seeds.length; i++)
    assert.ok(seeds[i - 1].pDem > seeds[i].pDem, `${CYCLES[i]}`)
  assert.ok(seeds[seeds.length - 1].pDem > 0.5)
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
  assert.equal(entries.length, 588)
  // Held entries cost nothing; the rest keep their own tiers.
  const heldKeys = new Set(r.held)
  assert.equal(
    r.totalMana,
    entriesOf(2028)
      .filter((e) => !heldKeys.has(e.raceKey))
      .reduce((sum, e) => sum + e.payload!.liquidityTier, 0)
  )
  assert.equal(r.manifest.budget.approvedMaxTotalMana, r.totalMana)
  assert.deepEqual(validateManifest(r.manifest, NOW), [])
  assert.match(r.manifest.review.notes!, /34 entries held/)
})

test('generation is deterministic for a fixed generatedAt', () => {
  for (const cycle of [2030, 2032] as const) {
    const again = buildManifest(cycle, {
      topics,
      generatedAt: GENERATED_AT,
      now: NOW,
    })
    assert.equal(
      JSON.stringify(again.manifest),
      JSON.stringify(built[cycle].manifest)
    )
  }
})

test('popular vote: one market per state and DC in each presidential cycle, seeded like the electoral market and never its duplicate', () => {
  const states = Object.keys(inventories.president().electoralVotes2024).sort()
  assert.equal(states.length, 51)
  // A created market as the duplicate search would see it.
  const asMarket = (x: RaceManifestEntry): MarketLike => ({
    id: x.raceKey,
    question: x.payload!.question,
    outcomeType: 'MULTIPLE_CHOICE',
    creatorUsername: 'ManifoldPolitics',
    answers: [...x.payload!.answers!, 'Other'].map((text, i) => ({
      id: String(i),
      text,
    })),
  })
  for (const cycle of CYCLES) {
    const entries = entriesOf(cycle)
    const popular = entries.filter(
      (e) => e.proposition === 'popular-vote-party'
    )
    assert.deepEqual(
      popular.map((e) => e.identity.state),
      cycleConfig(cycle).president ? states : [],
      `${cycle}`
    )
    const policy = built[cycle].manifest.duplicatePolicy
    for (const e of popular) {
      const st = e.identity.state
      const electoral = entries.find(
        (x) => x.raceKey === `${cycle}-president-${st}-general`
      )!
      assert.equal(e.raceKey, `${cycle}-president-${st}-popular-vote`)
      assert.equal(e.identity.office, 'president')
      assert.equal(e.identity.district, undefined)
      assert.deepEqual(e.dashboard, {
        list: `presidentPopular${cycle}`,
        key: st,
        cycle,
        office: 'president',
      })
      assert.equal(
        e.payload!.question,
        `Which party will win the popular vote in ${st === 'DC' ? 'the ' : ''}${
          e.identity.stateName
        } in the ${cycle} presidential election?`
      )
      // The same answers, seeds, close time and topics as the state's
      // electoral market; Ṁ10,000 in 2028, Ṁ1,000 later.
      assert.deepEqual(e.payload!.answers, electoral.payload!.answers)
      assert.deepEqual(e.payload!.answerProbs, electoral.payload!.answerProbs)
      assert.deepEqual(e.answerMeta, electoral.answerMeta)
      assert.deepEqual(e.seed, electoral.seed)
      assert.equal(e.payload!.closeTime, electoral.payload!.closeTime)
      assert.deepEqual(e.payload!.groupIds, electoral.payload!.groupIds)
      assert.equal(e.payload!.liquidityTier, cycle === 2028 ? 10_000 : 1_000)
      // Once one exists, the other is never its duplicate (in either
      // direction): at most a related market, which the policy only lists.
      for (const [entry, other] of [
        [e, electoral],
        [electoral, e],
      ]) {
        const v = classifyExistingMarket(entry, asMarket(other))
        assert.ok(
          v.verdict === 'ambiguous' || v.verdict === 'unrelated',
          `${entry.raceKey} vs ${other.raceKey}: ${v.verdict}`
        )
        if (v.verdict === 'ambiguous')
          assert.equal(
            duplicateAction(policy, {
              verdict: v.verdict,
              creatorUsername: 'ManifoldPolitics',
            }),
            'info'
          )
      }
      // Each still finds a copy of itself, so a rerun never creates twice.
      assert.equal(classifyExistingMarket(e, asMarket(e)).verdict, 'equivalent')
      assert.equal(
        classifyExistingMarket(electoral, asMarket(electoral)).verdict,
        'equivalent'
      )
    }
  }
  // The national and district electoral markets aren't confused with a
  // state's popular vote either.
  const al = entriesOf(2028).find(
    (e) => e.raceKey === '2028-president-AL-popular-vote'
  )!
  const ne = entriesOf(2028).find(
    (e) => e.raceKey === '2028-president-NE-popular-vote'
  )!
  for (const key of [
    '2028-president-US-general',
    '2028-president-NE-02-general',
  ])
    assert.equal(
      classifyExistingMarket(
        key.includes('NE') ? ne : al,
        asMarket(entriesOf(2028).find((e) => e.raceKey === key)!)
      ).verdict === 'equivalent',
      false,
      key
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
