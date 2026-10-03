import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildRaces, seatSummary } from './election-map-model'
import { getHeldOffice, getIncumbentGroups } from './election-incumbents'
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

test('incumbent context covers every race and preserves vacancies and independent affiliations', () => {
  for (const mode of ['house', 'senate', 'governor'] as const) {
    for (const race of buildRaces(mode, {})) {
      const groups = getIncumbentGroups(mode, race.state, race.district)
      assert.ok(groups.length > 0, `${mode}: ${race.id}`)
      for (const member of groups.flatMap((g) => g.members)) {
        assert.ok(member.name.trim())
        assert.ok(
          ['Democrat', 'Republican', 'Independent'].includes(member.party)
        )
      }
    }
  }
  const states = Object.keys(DATA).filter((state) => state !== 'DC')
  assert.equal(
    states.flatMap((s) =>
      getIncumbentGroups('senate', s).flatMap((g) => g.members)
    ).length,
    100
  )
  assert.equal(
    states.flatMap((s) =>
      getIncumbentGroups('governor', s).flatMap((g) => g.members)
    ).length,
    50
  )
  assert.equal(
    getIncumbentGroups('senate', 'FL')[0].members[0].name,
    'Ashley Moody'
  )
  assert.equal(
    getIncumbentGroups('senate', 'OH')[0].members[0].name,
    'Jon Husted'
  )
  assert.equal(
    getIncumbentGroups('senate', 'OK')[0].members[0].name,
    'Alan Armstrong'
  )
  assert.equal(
    getIncumbentGroups('house', 'CA', 3)[0].members[0].party,
    'Independent'
  )
  assert.deepEqual(getIncumbentGroups('house', 'FL', 20)[0].members, [])
  assert.ok(getIncumbentGroups('house', 'AK', 0)[0].label.includes('AK-AL'))
  assert.deepEqual(getIncumbentGroups('house', 'CA', 99), [])
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
