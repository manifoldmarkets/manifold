import { recordedTeamCode } from 'common/bdl/team-codes'
import teams from '../../test/fixtures/bdl/nba/teams__recorded-active.json'

it('maps every active recorded NBA team to its published abbreviation', () => {
  expect(teams.data).toHaveLength(30)
  expect(new Set(teams.data.map((team) => team.id)).size).toBe(30)
  for (const team of teams.data) {
    expect(recordedTeamCode('nba', String(team.id))).toBe(team.abbreviation)
  }
})
