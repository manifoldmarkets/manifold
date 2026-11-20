import { recordedTeamCode } from './team-codes'

it('resolves an NBA abbreviation by stable identity even when other leagues reuse the ID', () => {
  expect(recordedTeamCode('nba', '9')).toBe('DET')
  expect(recordedTeamCode('nba', '2')).toBe('BOS')
  expect(recordedTeamCode('nfl', '9')).toBeUndefined()
  expect(recordedTeamCode('nba', '01')).toBeUndefined()
  expect(recordedTeamCode('nba', 'constructor')).toBeUndefined()
  expect(recordedTeamCode('nba')).toBeUndefined()
})
