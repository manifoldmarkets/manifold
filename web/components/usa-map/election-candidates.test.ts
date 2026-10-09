import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildRaces, matchesRaceQuery } from './election-map-model'
import { candidateForParty, raceCandidates } from './election-candidates'
import { outcomeRow } from './race-outcomes'

test('audited nominees cover all races, independently of market availability', () => {
  const races = ['house', 'senate', 'governor'].flatMap((mode) =>
    buildRaces(mode as 'house' | 'senate' | 'governor', {})
  )
  assert.equal(races.length, 506)
  assert.ok(races.every((r) => r.candidates?.length))
  const texas = buildRaces('senate', {}).find((r) => r.id === 'TX')!
  assert.equal(candidateForParty(texas, 'dem'), 'James Talarico')
  assert.equal(candidateForParty(texas, 'rep'), 'Ken Paxton')
  assert.equal(matchesRaceQuery(texas, 'Talarico'), true)
  assert.equal(texas.odds, undefined)
  assert.ok(raceCandidates('house', 'AK-0').length)
})

test('every ballot entry has a name, so matching answers to it cannot throw', () => {
  for (const mode of ['house', 'senate', 'governor'] as const)
    for (const race of buildRaces(mode, {}))
      for (const c of race.candidates ?? [])
        assert.ok(c.name?.trim(), `${mode} ${race.id}: nameless ballot entry`)
  // CO-1's data has an entry with a party but no name; its race panel crashed
  // matching "Diana DeGette (D)" against the ballot.
  const ballot = raceCandidates('house', 'CO-1')
  assert.deepEqual(
    ballot.map((c) => c.name),
    ['Chad Humphrey', 'Melat Kiros', 'Critter Milton', 'Christy Peterson']
  )
  assert.doesNotThrow(() =>
    outcomeRow({ id: 'a', text: 'Diana DeGette (D)', prob: 0.01 }, ballot)
  )
})

test('complements and catch-all odds do not become one candidate probability', () => {
  const texas = buildRaces('senate', {}).find((r) => r.id === 'TX')!
  for (const party of ['notDem', 'notRep', 'unknown', 'other'] as const)
    assert.equal(candidateForParty(texas, party), undefined)
})

test('same-party and multiple-nominee races do not assign aggregate odds to one person', () => {
  const alaska = buildRaces('senate', {}).find((r) => r.id === 'AK')!
  assert.equal(candidateForParty(alaska, 'rep'), undefined)
  assert.equal(candidateForParty(alaska, 'dem'), 'Mary Peltola')
  const ca = buildRaces('house', {}).find((r) => r.id === 'CA-29')!
  assert.equal(candidateForParty(ca, 'dem'), undefined)
  assert.equal(ca.candidates?.length, 2)
})
