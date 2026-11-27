import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EsportsTeamRef } from 'common/esports/types'
import { plateCodes, teamCode } from './team-codes'

let nextId = 1
const team = (name: string, code: string | null = null): EsportsTeamRef => ({
  id: nextId++,
  name,
  code,
})
/** The codes as a plate shows them (upper case), in the order given. */
const plates = (teams: EsportsTeamRef[]) => {
  const codes = plateCodes(teams)
  return teams.map((t) => codes[t.id].toUpperCase())
}

test('teamCode: the provider code when it fits, else initials, else the start of the name', () => {
  assert.equal(teamCode(team('Ninjas in Pyjamas', 'NIP')), 'NIP')
  assert.equal(teamCode(team('Hanwha Life Esports')), 'HLE')
  assert.equal(teamCode(team('DENDELE')), 'DEND')
  // A code too long for a plate is never cut short: the name is used instead.
  assert.equal(teamCode(team('Long Code Team', 'LONGCODE9')), 'LCT')
  assert.equal(teamCode(team('Blank Code', '  ')), 'BC')
})

test('the reviewed pair: BC.Game and benched gods no longer both read BG', () => {
  assert.deepEqual(plates([team('BC.Game'), team('benched gods')]), [
    'BCGA',
    'BENC',
  ])
})

test('teams whose codes differ keep them', () => {
  const teams = [
    team('FlyQuest', 'FLY'),
    team('BC.Game'),
    team('DENDELE'),
    team('9z', '9z'),
  ]
  assert.deepEqual(plates(teams), ['FLY', 'BG', 'DEND', '9Z'])
})

test('codes that differ only by case clash: plates are upper case', () => {
  assert.deepEqual(plates([team('Big Guns'), team('benched gods')]), [
    'BIGG',
    'BENC',
  ])
})

test('names are taken a letter longer until they differ', () => {
  assert.deepEqual(plates([team('Evermore'), team('Everest')]), [
    'EVERM',
    'EVERE',
  ])
  assert.deepEqual(plates([team('Team Alpha'), team('Team Alpine')]), [
    'TEAMALPH',
    'TEAMALPI',
  ])
})

test('a code the provider sent is kept; the team without one changes', () => {
  assert.deepEqual(plates([team('BIG', 'BG'), team('benched gods')]), [
    'BG',
    'BENC',
  ])
})

test('two teams sent the same code both change', () => {
  assert.deepEqual(plates([team('Alpha Squad', 'AS'), team('Astral', 'AS')]), [
    'ALPH',
    'ASTR',
  ])
})

test('a lengthened code that runs into another code is lengthened again', () => {
  const teams = [
    team('Bench Warmers', 'BENC'),
    team('BC.Game'),
    team('benched gods'),
  ]
  assert.deepEqual(plates(teams), ['BENC', 'BCGA', 'BENCH'])
})

test('the same team twice is one team, and three can clash at once', () => {
  const bg = team('BC.Game')
  assert.deepEqual(plateCodes([bg, bg]), { [bg.id]: 'BG' })
  assert.deepEqual(
    plates([team('Blue Gate'), team('Bad Girls'), team('Big Game')]),
    ['BLUE', 'BADG', 'BIGG']
  )
})

test('names that never differ within a plate stop at eight letters', () => {
  assert.deepEqual(
    plates([team('Team Alphabet One'), team('Team Alphabet Omega')]),
    ['TEAMALPH', 'TEAMALPH']
  )
})
