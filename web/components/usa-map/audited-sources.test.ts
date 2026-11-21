import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Contract } from 'common/contract'
import { electionOdds } from './election-map-model'
import {
  auditedOdds,
  candidateBinaryParty,
  complementParty,
  foldComplement,
  raceOdds,
  seatBasis,
  sourceAudit,
  binaryElectionLabels,
} from './audited-sources'
import {
  getPartyProbs,
  partyProbsToColor,
  probToColor,
} from './state-election-map'
import {
  buildRaces,
  seatSummary,
  raceTier,
  matchesRaceQuery,
} from './election-map-model'

const binary = (id: string, p: number) =>
  ({
    id,
    mechanism: 'cpmm-1',
    outcomeType: 'BINARY',
    pool: { YES: 1 - p, NO: p },
    p: 0.5,
  } as unknown as Contract)

const multi = (
  id: string,
  answers: {
    id: string
    text: string
    probability: number
    resolution?: string
  }[]
) =>
  ({
    id,
    mechanism: 'cpmm-multi-1',
    shouldAnswersSumToOne: true,
    answers: answers.map((a) => ({
      ...a,
      poolYes: 1 - a.probability,
      poolNo: a.probability,
    })),
  } as unknown as Contract)

test('a YES = Democrat party binary is not read as a Republican win', () => {
  const slug = 'will-the-democratic-party-candidate-NQOPZAnOA8'
  const odds = auditedOdds(binary('RcL0Q9O0EU', 0.64), sourceAudit(slug)!)!
  assert.ok(Math.abs(odds.dem - 0.64) < 1e-9)
  // Maine's Senate ballot has a Republican nominee, so NO counts as R.
  assert.ok(Math.abs(odds.rep - 0.36) < 1e-9)
  assert.equal(odds.notDem, undefined)
  // The unaudited reading would have booked 64% as Republican.
  assert.ok(
    Math.abs(electionOdds(binary('RcL0Q9O0EU', 0.64))!.rep - 0.64) < 1e-9
  )
})

test('a YES = Republican party binary counts NO as the Democratic nominee', () => {
  const odds = auditedOdds(
    binary('uODgxBgIoHZWqFqHGPbe', 0.79),
    sourceAudit('will-a-republican-win-the-florida-g')!
  )!
  assert.ok(Math.abs(odds.rep - 0.79) < 1e-9)
  assert.ok(Math.abs(odds.dem - 0.21) < 1e-9)
  assert.equal(odds.notRep, undefined)
})

test('a complement stays separate where the other major party has no nominee', () => {
  // Nebraska's Senate race has no Democrat: NO on "will the Republican win?" is
  // the independent, not a Democratic win.
  assert.equal(complementParty('senate', 'NE', 'R'), undefined)
  const ne = foldComplement('senate', 'NE', {
    dem: 0,
    rep: 0.7,
    other: 0,
    notRep: 0.3,
  })
  assert.equal(ne?.dem, 0)
  assert.equal(ne?.notRep, 0.3)
  // California's 6th is a Democrat against an independent: no Republican.
  assert.equal(complementParty('house', 'CA-6', 'D'), undefined)
  assert.equal(complementParty('house', 'MT-1', 'D'), 'R')
  // A race without a recorded ballot assumes the other major party.
  assert.equal(complementParty('house', 'XX-1', 'D'), 'R')
})

test("a sole nominee's candidate binary counts as their party, like a one-sided price", () => {
  // CO-4: Boebert is the only Republican on the ballot (with a Democrat and a
  // Libertarian), so YES is the Republican and NO folds to the Democrat.
  const co = raceOdds(
    'house',
    'CO-4',
    binary('5EIC9A05cU', 0.64),
    'will-lauren-boebert-be-reelected-to',
    electionOdds
  )
  assert.deepEqual(co.basis, { kind: 'market' })
  assert.ok(Math.abs(co.odds!.rep - 0.64) < 1e-9)
  assert.ok(Math.abs(co.odds!.dem - 0.36) < 1e-9)
  assert.equal(co.odds!.notRep, undefined)
  // AL-2 and NC-9 name the Democrat.
  const al = raceOdds(
    'house',
    'AL-2',
    binary('2gnh0c6NqI', 0.3),
    'will-democrat-shomari-figures-win-a',
    electionOdds
  )
  assert.ok(Math.abs(al.odds!.dem - 0.3) < 1e-9)
  assert.ok(Math.abs(al.odds!.rep - 0.7) < 1e-9)
  const nc = sourceAudit('will-richard-ojeda-win-north-caroli')!
  assert.equal(candidateBinaryParty(nc), 'D')
})

test('a candidate binary that is not a sole nominee stays a candidate bet', () => {
  // CA-12 is a Democrat-vs-Democrat top-two race: a bet on one of them is not
  // a party price.
  const ca = sourceAudit('will-jamie-joyce-win-the-2026-12th')!
  assert.equal(candidateBinaryParty(ca), undefined)
  const r = raceOdds(
    'house',
    'CA-12',
    binary(ca.contractId, 0.6),
    'will-jamie-joyce-win-the-2026-12th',
    electionOdds
  )
  assert.notEqual(r.basis.kind, 'market')
  // A name that is not on the ballot (a primary loser, a typo) never counts.
  const offBallot = { ...sourceAudit('will-lauren-boebert-be-reelected-to')! }
  offBallot.candidate = 'Someone Else'
  assert.equal(candidateBinaryParty(offBallot), undefined)
  const r2 = raceOdds(
    'house',
    'CO-4',
    binary('5EIC9A05cU', 0.6),
    'will-lauren-boebert-be-reelected-to',
    () => undefined
  )
  assert.ok(r2.odds)
  // Not a candidate binary at all.
  assert.equal(
    candidateBinaryParty(sourceAudit('will-a-republican-win-the-florida-g')!),
    undefined
  )
})

test("a sole nominee's bet keeps its honest labels, in the party's color", () => {
  const labels = binaryElectionLabels({
    ...binary('5EIC9A05cU', 0.64),
    slug: 'will-lauren-boebert-be-reelected-to',
  } as Contract)
  assert.equal(labels.YES.pseudonymName, 'Lauren Boebert')
  assert.equal(labels.YES.pseudonymColor, 'sienna')
  assert.equal(labels.NO.pseudonymName, 'Any other winner')
  assert.equal(labels.NO.pseudonymColor, 'gray')
})

test('an answer labelled "Democrats OR Independents" for an independent is not counted as D', () => {
  const c = multi('sshNUOnpCZ', [
    { id: 'C8QtcURuZR', text: 'Republicans', probability: 0.92 },
    { id: '9zNRu0RANh', text: 'Democrats OR Independents', probability: 0.08 },
  ])
  const odds = auditedOdds(
    c,
    sourceAudit('which-party-will-win-the-2026-senat-OCp8sREOUZ')!
  )!
  assert.equal(odds.dem, 0)
  assert.ok(Math.abs(odds.other - 0.08) < 1e-9)
  assert.ok(electionOdds(c)!.dem > 0) // what the label reading does today
})

test('a withdrawn candidate answer cannot become Democratic share', () => {
  const c = multi('9zPhhzEnCc', [
    { id: 'AP0zQpUcug', text: 'Nick Begich III (R)', probability: 0.84 },
    { id: 'ytQ5UsCccN', text: 'Matt Schultz (D)', probability: 0.009 },
    { id: 'AzEt0Qtnu9', text: 'Bill Hill (I)', probability: 0.134 },
    { id: 'cAALtNgyhc', text: 'Other', probability: 0.017 },
  ])
  const odds = auditedOdds(
    c,
    sourceAudit('who-will-win-the-alaska-house-elect')!
  )!
  assert.equal(odds.dem, 0)
  assert.ok(Math.abs(odds.rep - 0.84) < 1e-9)
  assert.ok(Math.abs(odds.other - 0.134) < 1e-9)
  assert.ok(Math.abs(odds.unknown! - 0.026) < 1e-9)
})

test('same-party ballots count once for that party by ballot, untagged names included', () => {
  const kim = multi('U9PL8hI5sU', [
    { id: 'IqlglZsEA2', text: 'Ken Calvert', probability: 0.62 },
    { id: '8lSPE9LRSc', text: 'Young Kim', probability: 0.38 },
  ])
  assert.equal(electionOdds(kim)!.other, 1) // label reading: "Other leads 100%"
  const r = raceOdds(
    'house',
    'CA-40',
    kim,
    'who-will-win-the-us-house-race-in-c',
    electionOdds
  )
  assert.deepEqual(r.odds, { dem: 0, rep: 1, other: 0 })
  assert.equal(r.basis.kind, 'ballot')
  for (const id of [
    'CA-4',
    'CA-7',
    'CA-11',
    'CA-12',
    'CA-14',
    'CA-29',
    'CA-34',
    'CA-37',
  ])
    assert.equal((seatBasis(id) as { party: string }).party, 'D')
  // The seat still counts when its candidate market is missing or cancelled.
  assert.deepEqual(
    raceOdds('house', 'CA-29', undefined, undefined, electionOdds).odds,
    {
      dem: 1,
      rep: 0,
      other: 0,
    }
  )
})

test('a seat decided before Election Day counts by that fact', () => {
  const r = raceOdds('house', 'FL-10', undefined, undefined, electionOdds)
  assert.equal(r.basis.kind, 'decided')
  assert.deepEqual(r.odds, { dem: 1, rep: 0, other: 0 })
})

test('cancelled or mismatched audited sources go unpriced instead of falling back to labels', () => {
  const slug = 'will-a-republican-win-the-florida-g'
  const cancelled = {
    ...binary('uODgxBgIoHZWqFqHGPbe', 0.8),
    resolution: 'CANCEL',
  } as Contract
  assert.equal(
    raceOdds('governor', 'FL', cancelled, slug, electionOdds).odds,
    undefined
  )
  assert.equal(
    auditedOdds(binary('someOtherId', 0.8), sourceAudit(slug)!),
    undefined
  )
})

test('unaudited sources keep the existing reading, with the complement folded', () => {
  const c = binary('unaudited', 0.7)
  const r = raceOdds('senate', 'XX', c, 'not-in-the-audit', electionOdds)
  assert.equal(r.audited, false)
  // electionOdds reads a Republican binary; its NO becomes the Democratic share.
  assert.ok(Math.abs((r.odds?.rep ?? 0) - 0.7) < 1e-9)
  assert.ok(Math.abs((r.odds?.dem ?? 0) - 0.3) < 1e-9)
  assert.equal(r.odds?.notRep, undefined)
})

test('binary trade labels follow the actual proposition and name the complement party', () => {
  for (const [slug, id, label, noLabel] of [
    [
      'will-the-democratic-party-candidate-NQOPZAnOA8',
      'RcL0Q9O0EU',
      'Democratic',
      'Republican',
    ],
    [
      'democrats-win-2026-minnesota-gubern',
      'LNPL28tA80',
      'Democratic',
      'Republican',
    ],
    // Candidate binaries: NO is anyone but that candidate.
    [
      'will-jamie-joyce-win-the-2026-12th',
      'PsPO6z5zZt',
      'Jamie Joyce',
      'Any other winner',
    ],
    [
      'will-dan-sullivan-win-reelection-to',
      'ULun8EOAAn',
      'Dan S. Sullivan (incumbent)',
      'Any other winner',
    ],
    [
      'will-a-republican-win-the-florida-g',
      'uODgxBgIoHZWqFqHGPbe',
      'Republican',
      'Democratic',
    ],
  ]) {
    const labels = binaryElectionLabels({
      ...binary(id, 0.7),
      slug,
    } as Contract)
    assert.equal(labels.YES.pseudonymName, label)
    assert.equal(labels.NO.pseudonymName, noLabel)
  }
  const mismatched = binaryElectionLabels({
    ...binary('wrong-id', 0.7),
    slug: 'will-jamie-joyce-win-the-2026-12th',
  } as Contract)
  assert.equal(mismatched.YES.pseudonymName, 'Yes')
})

test('homepage colors count complements as the other major party, never independents as Democrats', () => {
  const rep = {
    ...binary('uODgxBgIoHZWqFqHGPbe', 0.3),
    slug: 'will-a-republican-win-the-florida-g',
  } as Contract
  assert.ok(Math.abs(getPartyProbs(rep)!.dem - 0.7) < 1e-9)
  assert.equal(probToColor(rep), partyProbsToColor(0.7, 0.3))
  const dem = {
    ...binary('RcL0Q9O0EU', 0.7),
    slug: 'will-the-democratic-party-candidate-NQOPZAnOA8',
  } as Contract
  assert.ok(Math.abs(getPartyProbs(dem)!.dem - 0.7) < 1e-9)
  assert.ok(Math.abs(getPartyProbs(dem)!.rep - 0.3) < 1e-9)
  const idaho = sourceAudit('which-party-will-win-the-2026-idaho-2PNUOhCEyR')!
  const answers = Object.entries(idaho.answerParties!).map(([id, party]) => ({
    id,
    text: party,
    probability: party === 'R' ? 0.3 : 0.7,
  }))
  const c = {
    ...multi(idaho.contractId, answers),
    slug: 'which-party-will-win-the-2026-idaho-2PNUOhCEyR',
  } as Contract
  assert.equal(
    getPartyProbs(c, {
      state: 'ID',
      slug: c.slug,
      otherParty: 'Democratic Party',
    })?.dem,
    0
  )
  assert.equal(probToColor(c), '#318b83')
})

test('unknown/new answers remain unclassified, never independent wins', () => {
  const source = sourceAudit('who-will-win-the-alaska-house-elect')!
  const c = multi(source.contractId, [
    { id: 'new-answer', text: 'Replacement (D)', probability: 1 },
  ])
  const odds = auditedOdds(c, source)!
  assert.equal(odds.unknown, 1)
  assert.equal(odds.dem, 0)
  assert.equal(odds.other, 0)
  assert.equal(raceTier({ odds }), 'unknown')
})

test('all nine California ballots remain searchable and counted once with unavailable candidate markets', () => {
  const races = buildRaces('house', {})
  const expected = {
    'CA-4': 'D',
    'CA-7': 'D',
    'CA-11': 'D',
    'CA-12': 'D',
    'CA-14': 'D',
    'CA-29': 'D',
    'CA-34': 'D',
    'CA-37': 'D',
    'CA-40': 'R',
  }
  for (const [id, party] of Object.entries(expected)) {
    const race = races.find((r) => r.id === id)!
    assert.equal(raceTier(race), party === 'D' ? 'fixed-d' : 'fixed-r')
    assert.equal(race.contract, undefined)
    assert.ok(matchesRaceQuery(race, id))
    if (race.basis?.kind === 'ballot')
      assert.ok(matchesRaceQuery(race, race.basis.finalists[0]))
  }
  const summary = seatSummary(races, 'house')
  // Eight CA seats, FL-10 and the uncontested MA-2, MA-5, MA-7 and WI-2.
  assert.equal(summary.counts['fixed-d'], 13)
  assert.equal(summary.counts['fixed-r'], 1)
  assert.equal(summary.counts['safe-d'], 0)
  assert.equal(summary.total, 435)
})

test('reviewed Midwest answers map by ID without broadening the district-label parser', () => {
  const slug = 'which-us-house-districts-in-the-mid'
  const c = {
    ...multi('s2uNNQ2N5I', [
      {
        id: 'SSlgtzn9gz',
        text: "Minnesota's 2nd district (OPEN-D)",
        probability: 0.8,
      },
      {
        id: '8p5pl6cgSE',
        text: "Ohio's 10th district (Turner-R)",
        probability: 0.2,
      },
      { id: 'unreviewed', text: 'Ohio 1', probability: 0.6 },
    ]),
    shouldAnswersSumToOne: false,
    slug,
  } as Contract
  const races = buildRaces('house', {}, null, { [slug]: c })
  assert.equal(races.find((r) => r.id === 'MN-2')?.answerId, 'SSlgtzn9gz')
  // OH-10 has a Republican nominee, so the portfolio's NO counts as R.
  const oh10 = races.find((r) => r.id === 'OH-10')?.odds
  assert.ok(Math.abs((oh10?.rep ?? 0) - 0.8) < 1e-9)
  assert.equal(oh10?.notDem, undefined)
  assert.equal(races.find((r) => r.id === 'OH-1')?.contract, undefined)
})
