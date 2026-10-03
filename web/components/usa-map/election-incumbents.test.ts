import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildRaces, seatSummary } from './election-map-model'
import { getHeldOffice } from './election-incumbents'
import { DATA } from './usa-map-data'

test('incumbent shading covers exactly off-ballot states, never unpriced elections', () => {
  const states = Object.keys(DATA).filter((state) => state !== 'DC')
  for (const mode of ['senate', 'governor'] as const) {
    const races = buildRaces(mode, {})
    const scheduled = new Set(races.map((race) => race.state))
    for (const state of states) {
      assert.equal(!!getHeldOffice(mode, state), !scheduled.has(state), state)
    }
    // Incumbent context must not manufacture prices for missing markets.
    assert.equal(seatSummary(races, mode).leaders.unpriced, races.length)
  }
  assert.equal(getHeldOffice('house', 'CA'), undefined)
  assert.equal(getHeldOffice('senate', 'DC'), undefined)
})

test('off-ballot details preserve split delegations and independent affiliations', () => {
  assert.equal(getHeldOffice('senate', 'PA')?.control, 'split')
  assert.deepEqual(
    getHeldOffice('senate', 'PA')?.members.map((m) => m.party),
    ['Democrat', 'Republican']
  )
  assert.equal(getHeldOffice('senate', 'VT')?.control, 'dem')
  assert.equal(getHeldOffice('senate', 'VT')?.members[0].party, 'Independent')
  assert.equal(getHeldOffice('governor', 'VA')?.control, 'dem')
  assert.equal(getHeldOffice('governor', 'UT')?.control, 'rep')
})
