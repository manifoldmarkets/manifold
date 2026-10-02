import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Contract } from 'common/contract'
import atlas from 'web/public/data/election-atlas.json'
import {
  buildRaces,
  electionOdds,
  leadingParty,
  parseHouseAnswer,
  Race,
  raceTier,
  seatSummary,
  outcomeLabel,
  raceColor,
  COMPLEMENT_COLOR,
  matchesRaceQuery,
  matchesStateQuery,
} from './election-map-model'

const multi = (
  answers: { text: string; probability: number; resolution?: string }[],
  shouldAnswersSumToOne = true
) =>
  ({
    mechanism: 'cpmm-multi-1',
    shouldAnswersSumToOne,
    answers: answers.map((a, i) => ({
      id: String(i),
      text: a.text,
      poolYes: 1 - a.probability,
      poolNo: a.probability,
      resolution: a.resolution,
    })),
  } as Contract)

test('district search matches exact numbers and state codes without unrelated substrings', () => {
  const races = buildRaces('house', {})
  for (const query of ['TX-1', 'TX 01', 'tx1', 'TX–1']) {
    assert.deepEqual(
      races.filter((r) => matchesRaceQuery(r, query)).map((r) => r.id),
      ['TX-1']
    )
  }
  assert.equal(
    races.filter((r) => matchesRaceQuery(r, 'California')).length,
    52
  )
  assert.equal(races.filter((r) => matchesRaceQuery(r, 'IN')).length, 9)
  assert.equal(races.filter((r) => matchesRaceQuery(r, 'Virginia')).length, 11)
  assert.equal(
    matchesRaceQuery(races.find((r) => r.id === 'AK-0')!, 'AK-AL'),
    true
  )
  assert.equal(matchesStateQuery('VA', 'virginia'), true)
  assert.equal(matchesStateQuery('VA', 'VA'), true)
  assert.equal(matchesStateQuery('WV', 'VA'), false)
  assert.equal(matchesStateQuery('WV', 'Virginia'), false)
})

test('all 435 House races match both geographic and cartogram geometry exactly', () => {
  const races = buildRaces('house', {})
  assert.equal(races.length, 435)
  const ids = races.map((r) => r.id).sort()
  assert.equal(new Set(ids).size, 435)
  assert.deepEqual(
    ids,
    atlas.districts.map((d) => `${d.state}-${d.district}`).sort()
  )
  assert.deepEqual(
    ids,
    atlas.hex.hexes.map((d) => `${d.state}-${d.district}`).sort()
  )
})

test('missing markets do not erase scheduled races or manufacture prices', () => {
  const senate = buildRaces('senate', {})
  const governor = buildRaces('governor', {})
  assert.equal(senate.length, 35)
  assert.equal(governor.length, 36)
  assert.equal(seatSummary(senate, 'senate').total, 100)
  assert.deepEqual(seatSummary(senate, 'senate').leaders, {
    dem: 34,
    rep: 31,
    other: 0,
    notDem: 0,
    notRep: 0,
    tied: 0,
    unpriced: 35,
  })
  assert.equal(seatSummary(governor, 'governor').leaders.unpriced, 36)
})

test('district labels, candidate suffixes, and at-large labels join reliably', () => {
  assert.deepEqual(
    parseHouseAnswer('West Virginia 2 · Candidate (D) v. Other (R)'),
    { state: 'WV', district: 2, matchup: 'Candidate (D) v. Other (R)' }
  )
  assert.equal(parseHouseAnswer('Alaska at-large')?.district, 0)
  assert.equal(parseHouseAnswer('Alaska 1')?.district, 0)
  assert.equal(parseHouseAnswer('California 49')?.district, 49)
  assert.equal(parseHouseAnswer('California Senate'), undefined)
  assert.equal(
    parseHouseAnswer("Texas' 35th Congressional District")?.district,
    35
  )
  assert.equal(
    parseHouseAnswer('New York’s 2nd Congressional District')?.district,
    2
  )
  assert.equal(parseHouseAnswer('California 99'), undefined)
  assert.equal(parseHouseAnswer('Alaska 55'), undefined)
})

test('independents remain independent even when no Democrat is on the ballot', () => {
  const odds = electionOdds(
    multi([
      { text: 'Republicans', probability: 0.35 },
      { text: 'Independent (Dan Osborn)', probability: 0.65 },
    ])
  )
  assert.deepEqual(odds, { dem: 0, rep: 0.35, other: 0.65 })
  assert.equal(leadingParty(odds), 'other')
  assert.equal(raceTier({ odds }), 'other')
})

test('exact ties are separate, while toss-up leaders still count once', () => {
  const races = [
    { odds: { dem: 0.5, rep: 0.5, other: 0 } },
    { odds: { dem: 0.51, rep: 0.49, other: 0 } },
    { odds: { dem: 0.1, rep: 0.1, other: 0.8 } },
    {},
  ] as Race[]
  const s = seatSummary(races, 'house')
  assert.deepEqual(s.leaders, {
    dem: 1,
    rep: 0,
    other: 1,
    notDem: 0,
    notRep: 0,
    tied: 1,
    unpriced: 1,
  })
  assert.equal(
    Object.values(s.counts).reduce((a, b) => a + b, 0),
    4
  )
  assert.equal(
    Object.values(s.leaders).reduce((a, b) => a + b, 0),
    4
  )
})

test('resolved House outcomes override pools; cancelled answers stay unpriced', () => {
  const house = multi(
    [
      { text: 'California 49', probability: 0.3, resolution: 'YES' },
      { text: 'Texas 15', probability: 0.7, resolution: 'CANCEL' },
    ],
    false
  )
  const races = buildRaces('house', {}, house)
  assert.equal(races.find((r) => r.id === 'CA-49')?.odds?.dem, 1)
  assert.equal(races.find((r) => r.id === 'TX-15')?.odds, undefined)
})

test('a Montana NO quote is not a Republican quote or a Republican seat', () => {
  const races = buildRaces(
    'house',
    {},
    multi([{ text: 'Montana 1', probability: 0.32 }], false)
  )
  const race = races.find((r) => r.id === 'MT-1')!
  assert.equal(race.odds?.dem, 0.32)
  assert.equal(race.odds?.rep, 0)
  assert.equal(race.odds?.notDem, 1 - 0.32)
  assert.equal(outcomeLabel(leadingParty(race.odds)!), 'Not D')
  assert.equal(raceTier(race), 'not-d')
  assert.equal(raceColor(race), COMPLEMENT_COLOR)
  const summary = seatSummary(races, 'house')
  assert.equal(summary.leaders.rep, 0)
  assert.equal(summary.leaders.notDem, 1)
  assert.equal(summary.expected.rep, 0)
  assert.equal(summary.expected.notDem, 1 - 0.32)
  assert.equal(
    Object.values(summary.counts).reduce((a, b) => a + b, 0),
    435
  )
})

test('Republican NO includes every other winner, while control odds retain their two sides', () => {
  const contract = {
    mechanism: 'cpmm-1',
    outcomeType: 'BINARY',
    p: 0.5,
    pool: { YES: 70, NO: 30 },
  } as unknown as Contract
  const odds = electionOdds(contract)!
  assert.equal(odds.rep, 0.3)
  assert.equal(odds.dem, 0)
  assert.equal(odds.notRep, 0.7)
  assert.equal(raceTier({ odds }), 'not-r')
  assert.equal(outcomeLabel(leadingParty(odds)!), 'Not R')
  assert.equal(electionOdds(contract, true)?.dem, 0.7)
})

test('reviewed state portfolios add coverage without replacing curated races', () => {
  const primary = multi([{ text: 'Texas 15', probability: 0.8 }], false)
  const additional = {
    'which-texas-house-districts-will-th': multi(
      [
        { text: "Texas' 15th Congressional District", probability: 0.2 },
        { text: "Texas' 1st Congressional District", probability: 0.1 },
      ],
      false
    ),
  }
  const races = buildRaces('house', {}, primary, additional)
  assert.equal(races.find((r) => r.id === 'TX-15')?.odds?.dem, 0.8)
  assert.equal(races.find((r) => r.id === 'TX-1')?.odds?.dem, 0.1)
  assert.equal(
    races.find((r) => r.id === 'TX-1')?.contract,
    additional['which-texas-house-districts-will-th']
  )
  assert.equal(seatSummary(races, 'house').leaders.unpriced, 433)
})

test('a cancelled source falls back, while malformed district portfolios do not price races', () => {
  const primary = multi(
    [{ text: 'Texas 15', probability: 0.8, resolution: 'CANCEL' }],
    false
  )
  const additional = {
    'which-texas-house-districts-will-th': multi(
      [{ text: "Texas' 15th Congressional District", probability: 0.2 }],
      false
    ),
  }
  assert.equal(
    buildRaces('house', {}, primary, additional).find((r) => r.id === 'TX-15')
      ?.odds?.dem,
    0.2
  )
  assert.equal(
    buildRaces(
      'house',
      {},
      multi([{ text: 'Texas 15', probability: 0.8 }])
    ).find((r) => r.id === 'TX-15')?.odds,
    undefined
  )
})

test('Alaska uses its reviewed candidate market over the Democratic district portfolio', () => {
  const portfolio = multi(
    [{ text: 'Alaska at-large', probability: 0.02 }],
    false
  )
  const candidates = multi([
    { text: 'Nick Begich III (R)', probability: 0.3 },
    { text: 'Matt Schultz (D)', probability: 0.01 },
    { text: 'Bill Hill (I)', probability: 0.68 },
    { text: 'Other', probability: 0.01 },
  ])
  const additional = { 'who-will-win-the-alaska-house-elect': candidates }
  const race = buildRaces('house', {}, portfolio, additional).find(
    (r) => r.id === 'AK-0'
  )!
  assert.equal(race.contract, candidates)
  assert.equal(race.answerId, undefined)
  assert.equal(race.odds?.notDem, undefined)
  assert.equal(leadingParty(race.odds), 'other')
  assert.equal(seatSummary([race], 'house').leaders.rep, 0)

  for (const unavailable of [
    null,
    { ...candidates, resolution: 'CANCEL' } as Contract,
  ]) {
    const fallback = buildRaces('house', {}, portfolio, {
      'who-will-win-the-alaska-house-elect': unavailable,
    }).find((r) => r.id === 'AK-0')!
    assert.equal(fallback.contract, portfolio)
    assert.equal(fallback.answerId, '0')
    assert.equal(fallback.odds?.notDem, 0.98)
  }
})

test('same-party general-election candidate markets retain candidate bets and sum party odds', () => {
  const candidates = multi([
    { text: 'Candidate A (D)', probability: 0.6 },
    { text: 'Candidate B (D)', probability: 0.4 },
  ])
  const race = buildRaces('house', {}, null, {
    '2026-us-house-ca-7-winner': candidates,
  }).find((r) => r.id === 'CA-7')!
  assert.deepEqual(race.odds, { dem: 1, rep: 0, other: 0 })
  assert.equal(race.answerId, undefined)
  assert.equal(race.contract, candidates)
})

test('cancelled markets and invalid probabilities are unpriced', () => {
  const contract = multi([
    { text: 'Democrats', probability: 0.5 },
    { text: 'Republicans', probability: 0.5 },
  ])
  assert.equal(
    electionOdds({ ...contract, resolution: 'CANCEL' } as Contract),
    undefined
  )
  assert.equal(
    electionOdds(multi([{ text: 'Democrats', probability: NaN }])),
    undefined
  )
})
