// Regression tests for the 2028/2030/2032 (+ optional 2036) manifest
// generator. Run from the repository root:
//   TS_NODE_PROJECT=backend/scripts/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 \
//     node -r ts-node/register --test backend/scripts/elections-2028-2036/generate-manifests.test.ts
import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  costOf,
  hasOtherAnswer,
  idempotencyKeyFor,
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
  OPTIONAL_CYCLES,
} from './cycles'
import {
  buildManifest,
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
})

test('counts per cycle and office match the brief; 707 markets at Ṁ1,000 for 2028–2032, 808 with 2036', () => {
  assert.deepEqual([...CYCLES], [2028, 2030, 2032, 2036])
  assert.deepEqual([...OPTIONAL_CYCLES], [2036])
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
  assert.equal(entriesOf(2030).length, 69)
  assert.equal(entriesOf(2032).length, 101)
  assert.equal(entriesOf(2036).length, 101)
  assert.equal(total, 808)
  assert.equal(mana, 808_000)
  const core = CYCLES.filter((c) => !OPTIONAL_CYCLES.includes(c))
  assert.deepEqual(core, [2028, 2030, 2032])
  assert.equal(
    core.reduce((s, c) => s + built[c].totalMana, 0),
    707_000
  )
})

test('every generated manifest validates with zero errors and is not approved', () => {
  for (const cycle of CYCLES) {
    const m = built[cycle].manifest
    assert.deepEqual(validateManifest(m, NOW), [])
    assert.equal(m.review.approved, false)
    assert.equal(m.series, `us-${cycle}-general-v1`)
    assert.equal(m.kind, 'races')
    // 2036 says it is optional; the launch-scope cycles do not.
    assert.equal(
      /Optional cycle/.test(m.review.notes ?? ''),
      OPTIONAL_CYCLES.includes(cycle),
      `${cycle}`
    )
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
    // Two listed answers plus Other: still the Ṁ1,000 minimum ante.
    assert.equal(hasOtherAnswer(e.payload!), true)
    assert.deepEqual(
      [costOf(e.payload!).numAnswers, costOf(e.payload!).total],
      [3, 1000]
    )
    assert.equal(e.payload!.liquidityTier, 1000)
    assert.equal(e.payload!.visibility, 'public')
    assert.equal(e.proposition, 'ballot-party')
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
  if (office === 'president')
    return state === 'ME'
      ? /If no ticket gets a first-round majority, the final ranked-choice round decides\./
      : state === 'AK'
      ? new RegExp(
          `The final count under whatever counting method Alaska uses in ${cycle} decides\\.`
        )
      : undefined
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
    assert.ok(d.length >= 400 && d.length <= 800, `${e.raceKey}: ${d.length}`)
    assert.equal(paras.length, office === 'president' ? 4 : 3, e.raceKey)
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
    if (state !== 'US')
      assert.match(
        paras[paras.length - 1],
        /^Resolves on the certified result, or earlier once the AP has called the (race|state|district|District) and no recount could change it\. N\/A if /,
        e.raceKey
      )
    if (office === 'senate')
      assert.ok(
        paras[0].startsWith(
          `Resolves to the party that wins the ${longDate(
            cfg.electionDate
          )} U.S. Senate election in ${stateName} (Class ${
            { 2028: 3, 2030: 1, 2032: 2, 2036: 1 }[cycle]
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
    if (office === 'president') {
      if (state === 'US') {
        assert.match(
          d,
          new RegExp(
            `270 or more electoral votes as counted by Congress in January ${
              cycle + 1
            }, or whom the House picks if no one does\\. The national popular vote doesn't matter\\.`
          ),
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
      } else {
        assert.equal(
          paras[1],
          "What counts is which ticket's electors are certified as elected, not the popular-vote margin; how electors later vote doesn't matter.",
          e.raceKey
        )
        if (e.identity.district !== undefined)
          assert.match(
            d,
            /electoral vote of .+'s \d(st|nd|rd) congressional district \([A-Z]{2}-\d\).*N\/A if .+ stops awarding electors by district/s,
            e.raceKey
          )
        else if (state === 'ME' || state === 'NE')
          assert.match(d, /two statewide electoral votes/, e.raceKey)
        else assert.match(d, /holds no popular vote for electors\.$/, e.raceKey)
      }
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
  assert.equal(
    desc('2028-president-NE-02-general').split('\n\n')[0],
    "Resolves to the party of the presidential ticket that wins the electoral vote of Nebraska's 2nd congressional district (NE-2) in the November 7, 2028 election."
  )
  assert.equal(
    desc('2028-president-US-general'),
    [
      'Resolves to the party of the candidate elected President in the November 7, 2028 election.',
      "That's whoever wins 270 or more electoral votes as counted by Congress in January 2029, or whom the House picks if no one does. The national popular vote doesn't matter.",
      "Only the party matters: a ticket on the Democratic or Republican line counts as that party even if also listed on other parties' lines. Any other ticket resolves to Other, or to its own answer if one has been added.",
      'N/A if no presidential election is held for the term starting January 20, 2029.',
    ].join('\n\n')
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
      `${office === 'governor' ? 'governors' : office}${cycle}`
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
  assert.equal(entries.length, 537)
  assert.equal(r.totalMana, (537 - 34) * 1000)
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

test('the race inventory matches the manifests one to one', () => {
  for (const cycle of CYCLES) {
    const races = racesFor(cycle)
    assert.deepEqual(
      races.map((r) => r.raceKey),
      entriesOf(cycle).map((e) => e.raceKey)
    )
  }
})
