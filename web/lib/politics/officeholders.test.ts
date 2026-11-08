// node:test suite for the map's officeholders. From web/:
//   TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' \
//     node --no-experimental-strip-types -r ts-node/register/transpile-only \
//     -r tsconfig-paths/register --test lib/politics/officeholders.test.ts

import { test } from 'node:test'
import * as assert from 'node:assert/strict'

import data from 'web/public/data/election-officeholders.json'
import { ELECTORAL_UNITS } from './ec-model'
import {
  governorOf,
  houseDelegation,
  nameWinner,
  nextSenateElection,
  OfficeholdersFile,
  partyOf,
  representativeOf,
  samePerson,
  senatorsOf,
} from './officeholders'

const file = data as OfficeholdersFile
const STATES = ELECTORAL_UNITS.filter(
  (u) => u.key === u.state && u.key !== 'DC'
).map((u) => u.key)

test('one person, however a list spells them', () => {
  assert.ok(samePerson('Nicholas J. Begich III', 'Nick Begich'))
  assert.ok(samePerson('Angus S. King, Jr.', 'Angus King'))
  assert.ok(samePerson("Beto O'Rourke", 'Beto ORourke'))
  assert.ok(!samePerson('John Cornyn', 'James Talarico'))
  assert.ok(!samePerson('', 'Anyone'))
})

test('a 2026 winner is named by the answer, else by the only candidate of the party', () => {
  const ri = [
    { name: 'Helena Foulkes', party: 'D' },
    { name: 'Aaron Guckian', party: 'R' },
    { name: 'Ken Block', party: 'I' },
  ]
  assert.deepEqual(nameWinner(ri, { text: 'Helena Foulkes' }), {
    name: 'Helena Foulkes',
    party: 'D',
  })
  assert.deepEqual(nameWinner(ri, { party: 'R' }), {
    name: 'Aaron Guckian',
    party: 'R',
  })
  // Two Republicans in a top-two race: the market can't say which.
  const ca40 = [
    { name: 'Ken Calvert', party: 'R' },
    { name: 'Young Kim', party: 'R' },
  ]
  assert.equal(nameWinner(ca40, { party: 'R' }), undefined)
  assert.equal(nameWinner(ri, {}), undefined)
  assert.equal(partyOf('Democrat'), 'D')
  assert.equal(partyOf('Republican'), 'R')
  assert.equal(partyOf('Independent'), 'I')
})

test('a seat is next on the ballot by its class', () => {
  assert.equal(nextSenateElection(1), 2030)
  assert.equal(nextSenateElection(2), 2032)
  assert.equal(nextSenateElection(3), 2028)
})

test('the data has every senator, governor and House seat', () => {
  const senators = Object.values(file.senate).flat()
  assert.equal(senators.length, 100)
  for (const st of STATES) {
    assert.equal(file.senate[st]?.length, 2, st)
    assert.ok(governorOf(file, st), `${st} governor`)
  }
  const byNext = (y: number) => senators.filter((s) => s.next === y).length
  // Class 3 (34 seats, the 2028 races), class 1 and class 2 (33 each).
  assert.equal(byNext(2028), 34)
  assert.equal(byNext(2030), 33)
  assert.equal(byNext(2032), 33)
  // 435 voting seats, seated or vacant, plus the delegates (DC and the
  // territories).
  const voting = Object.keys(file.house).filter((k) =>
    STATES.includes(k.split('-')[0])
  )
  assert.equal(voting.length + file.vacant.length, 435)
  for (const k of file.vacant) assert.ok(!file.house[k], k)
  assert.ok(representativeOf(file, 'DC-0'))
  // Every party letter is one we draw.
  for (const s of [...senators, ...Object.values(file.house)])
    assert.ok(['D', 'R', 'I'].includes(s.party), s.name)
})

test('lookups: senators by when they are next up, a delegation by party', () => {
  const pa = senatorsOf(file, 'PA')
  assert.ok(pa[0].next <= pa[1].next)
  const d = houseDelegation(file, 'PA')
  assert.equal(d.D + d.R + d.I, d.total)
  assert.ok(d.total >= 17)
  assert.equal(houseDelegation(file, 'WY').total, 1)
})
