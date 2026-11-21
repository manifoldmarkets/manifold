import { recordedTeamCode } from 'common/bdl/team-codes'
import { readFileSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'

const teamFile = join(
  __dirname,
  '../../test/fixtures/bdl/nba/teams__recorded-active.json'
)
const teams = z
  .object({
    data: z.array(
      z.object({
        id: z.number().int().positive(),
        abbreviation: z.string().min(1),
      })
    ),
  })
  .parse(JSON.parse(readFileSync(teamFile, 'utf8')))

it('maps every active recorded NBA team to its published abbreviation', () => {
  expect(teams.data).toHaveLength(30)
  expect(new Set(teams.data.map((team) => team.id)).size).toBe(30)
  for (const team of teams.data) {
    expect(recordedTeamCode('nba', String(team.id))).toBe(team.abbreviation)
  }
})
